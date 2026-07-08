import Phaser from 'phaser'
import { KEY_PAN_SPEED, ZOOM } from './config'
import { screenPxToWorld } from './units'
import { cameraWorldView } from './camera'

export interface CenterBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** The world-pixel point the camera is framed on at startup. */
export interface InitialCenter {
  x: number
  y: number
}

interface CameraControllerOptions {
  centerBounds: CenterBounds
  initialCenter: InitialCenter
  onZoomChanged: (zoom: number) => void
}

/**
 * Fail fast on a malformed play area. An inverted box (`min > max`) would not
 * throw downstream — `Phaser.Math.Clamp` would silently pin every position to
 * the lower bound, freezing the camera in a wrong spot — so reject it up front.
 * A non-finite corner (a projection that produced `NaN`) is likewise a bug we
 * want to see immediately rather than propagate into the scroll math.
 */
function assertValidCenterBounds(b: CenterBounds): void {
  if (![b.minX, b.maxX, b.minY, b.maxY].every(Number.isFinite)) {
    throw new Error(`[CameraController] centerBounds must be finite: ${JSON.stringify(b)}`)
  }
  if (b.minX > b.maxX || b.minY > b.maxY) {
    throw new Error(`[CameraController] centerBounds is inverted (min > max): ${JSON.stringify(b)}`)
  }
}

/**
 * The opening framing point must be finite (a projection that produced `NaN` is a
 * bug to surface now) and must sit inside the roam box — otherwise the initial
 * `clampCamera` would immediately yank the camera off the intended start point,
 * silently masking a mis-set constant.
 */
function assertValidInitialCenter(c: InitialCenter, b: CenterBounds): void {
  if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) {
    throw new Error(`[CameraController] initialCenter must be finite: ${JSON.stringify(c)}`)
  }
  if (c.x < b.minX || c.x > b.maxX || c.y < b.minY || c.y > b.maxY) {
    throw new Error(
      `[CameraController] initialCenter ${JSON.stringify(c)} is outside centerBounds ${JSON.stringify(b)}`,
    )
  }
}

type MoveKeys = {
  up: Phaser.Input.Keyboard.Key[]
  down: Phaser.Input.Keyboard.Key[]
  left: Phaser.Input.Keyboard.Key[]
  right: Phaser.Input.Keyboard.Key[]
}

export class CameraController {
  private readonly cam: Phaser.Cameras.Scene2D.Camera

  private readonly onZoomChanged: (zoom: number) => void

  private readonly centerBounds: CenterBounds

  private readonly initialCenter: InitialCenter

  private readonly moveKeys: MoveKeys

  constructor(scene: Phaser.Scene, options: CameraControllerOptions) {
    assertValidCenterBounds(options.centerBounds)
    assertValidInitialCenter(options.initialCenter, options.centerBounds)
    this.cam = scene.cameras.main
    this.onZoomChanged = options.onZoomChanged
    this.centerBounds = options.centerBounds
    this.initialCenter = options.initialCenter

    this.frameInitialView()
    this.installWheelZoom(scene)
    this.installDragPan(scene)
    this.moveKeys = this.installKeyboardPan(scene)

    // Frame is already centred; make sure it starts inside the clamp range, then
    // let the zoom-reactive layers render at the initial zoom set above.
    this.clampCamera()
    this.onZoomChanged(this.cam.zoom)
  }

  private frameInitialView(): void {
    this.cam.setZoom(ZOOM.min)
    this.cam.centerOn(this.initialCenter.x, this.initialCenter.y)
  }

  private installWheelZoom(scene: Phaser.Scene): void {
    scene.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (pointer: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) =>
        this.zoomTowardPointer(pointer, dy),
    )
  }

  /**
   * Mouse-wheel zoom, anchored so the world point under the cursor stays put.
   * Because zoom is centred on the camera midpoint, the world point under a
   * screen pixel `p` is `scroll + p/zoom` offset from the centre; holding it
   * fixed across a zoom change means shifting scroll by the closed-form
   * `(p - size/2)·(1/oldZoom - 1/newZoom)` on each axis. Computed directly (no
   * `getWorldPoint`, which reads a matrix Phaser only rebuilds at render time
   * and so would sample a stale transform mid-handler).
   */
  private zoomTowardPointer(pointer: Phaser.Input.Pointer, deltaY: number): void {
    const cam = this.cam
    const oldZoom = cam.zoom
    // Scale the zoom factor by the actual scroll delta so a full wheel notch
    // (`deltaPerStep`) applies one `ZOOM.step`, while a trackpad's many small-delta
    // events each nudge the zoom only slightly instead of compounding a fixed step.
    const factor = Math.pow(ZOOM.step, -deltaY / ZOOM.deltaPerStep)
    const newZoom = Phaser.Math.Clamp(oldZoom * factor, ZOOM.min, ZOOM.max)
    if (newZoom === oldZoom) return
    const anchorScale = 1 / oldZoom - 1 / newZoom
    cam.setZoom(newZoom)
    cam.scrollX += (pointer.x - cam.width / 2) * anchorScale
    cam.scrollY += (pointer.y - cam.height / 2) * anchorScale
    this.clampCamera()
    this.onZoomChanged(newZoom)
  }

  private installDragPan(scene: Phaser.Scene): void {
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) =>
      this.dragPan(pointer),
    )
  }

  /**
   * Click-drag pan: while the pointer is held, move the camera 1:1 with the
   * cursor at the current zoom (divide the screen delta by zoom to get the world
   * delta). The pointer-move event fires constantly; the `isDown` check is
   * legitimate event filtering (only drag while a button is held), not a bail-out.
   */
  private dragPan(pointer: Phaser.Input.Pointer): void {
    if (!pointer.isDown) return
    const cam = this.cam
    cam.scrollX -= (pointer.x - pointer.prevPosition.x) / cam.zoom
    cam.scrollY -= (pointer.y - pointer.prevPosition.y) / cam.zoom
    this.clampCamera()
  }

  /**
   * Bind the WASD/arrow pan keys. If the keyboard plugin is unavailable there is
   * no safe way to continue — fail fast rather than silently dropping keyboard
   * control.
   */
  private installKeyboardPan(scene: Phaser.Scene): MoveKeys {
    const kb = scene.input.keyboard
    if (!kb) throw new Error('[CameraController] keyboard input unavailable')
    const K = Phaser.Input.Keyboard.KeyCodes
    return {
      up: [kb.addKey(K.W), kb.addKey(K.UP)],
      down: [kb.addKey(K.S), kb.addKey(K.DOWN)],
      left: [kb.addKey(K.A), kb.addKey(K.LEFT)],
      right: [kb.addKey(K.D), kb.addKey(K.RIGHT)],
    }
  }

  update(deltaSeconds: number): void {
    const { dx, dy } = this.readPanDirection()
    if (dx === 0 && dy === 0) return
    const step = screenPxToWorld(KEY_PAN_SPEED * deltaSeconds, this.cam.zoom)
    this.cam.scrollX += dx * step
    this.cam.scrollY += dy * step
    this.clampCamera()
  }

  private readPanDirection(): { dx: number; dy: number } {
    const keys = this.moveKeys
    const isDown = (group: Phaser.Input.Keyboard.Key[]) => group.some((k) => k.isDown)
    return {
      dx: (isDown(keys.right) ? 1 : 0) - (isDown(keys.left) ? 1 : 0),
      dy: (isDown(keys.down) ? 1 : 0) - (isDown(keys.up) ? 1 : 0),
    }
  }

  reclampToBounds(): void {
    this.clampCamera()
  }

  /** Confine the camera centre to the play-area box. */
  private clampCamera(): void {
    const cam = this.cam
    const view = cameraWorldView(cam)

    const b = this.centerBounds
    const centerX = Phaser.Math.Clamp(view.centerX, b.minX, b.maxX)
    const centerY = Phaser.Math.Clamp(view.centerY, b.minY, b.maxY)

    // Derive scroll back from the clamped centre. Centre = scroll + size/2, so
    // scroll = centre - size/2 (Phaser's midpoint relation, not size/zoom).
    cam.scrollX = centerX - cam.width / 2
    cam.scrollY = centerY - cam.height / 2
  }
}
