import Phaser from 'phaser'
import { CAMERA_MARGIN_SCREEN, DPR, KEY_PAN_SPEED, ZOOM } from './config'
import { cameraWorldView, screenPxToWorld } from './units'

/** Device-pixel bounding box of the projected map. */
export interface MapBounds {
  x: number
  y: number
  width: number
  height: number
}

interface CameraControllerOptions {
  bounds: MapBounds
  /** Called after every zoom change with the new zoom, so zoom-reactive layers can redraw. */
  onZoomChanged: (zoom: number) => void
}

/**
 * Owns every way the player can move the camera: mouse-wheel zoom (anchored under
 * the cursor), click-drag pan, and WASD/arrow keyboard pan. Extracted from the
 * former god-scene so camera behaviour lives in exactly one place.
 *
 * Scroll is confined with a manual clamp (`clampCamera`) whose range is DERIVED
 * from the projected map plus a fixed on-screen margin — not a hard-coded scroll
 * box. We deliberately do NOT use Phaser's `camera.setBounds`: it locks and
 * re-centres the camera whenever the visible area is larger than the bounds
 * (true here — a small country in a large viewport), which would forbid panning
 * and fight the zoom-to-cursor anchor. A manual clamp always allows movement
 * within its range at any zoom level.
 */
export class CameraController {
  /**
   * The scene's main camera. Stored because `update` and the input handlers step
   * it long after the constructor has returned.
   */
  private readonly cam: Phaser.Cameras.Scene2D.Camera

  /**
   * Notified with the new zoom after every wheel-zoom so zoom-reactive layers
   * (hairline coastline, constant-size city markers) can re-stroke themselves.
   */
  private readonly onZoomChanged: (zoom: number) => void

  /** Map bounding box (world/device px) the pannable range is derived from. */
  private readonly bounds: MapBounds
  /** How far (world px) the camera may travel past the map edges. */
  private readonly margin: number

  /**
   * The keys bound to each pan direction. Both WASD and the arrow keys drive the
   * same direction so either hand works. Stored because `update` polls their
   * `isDown` state every frame.
   */
  private readonly moveKeys: {
    up: Phaser.Input.Keyboard.Key[]
    down: Phaser.Input.Keyboard.Key[]
    left: Phaser.Input.Keyboard.Key[]
    right: Phaser.Input.Keyboard.Key[]
  }

  constructor(scene: Phaser.Scene, options: CameraControllerOptions) {
    const cam = scene.cameras.main
    this.cam = cam
    this.onZoomChanged = options.onZoomChanged
    this.bounds = options.bounds
    // The margin is an on-screen CSS distance; convert to world (device) px.
    this.margin = CAMERA_MARGIN_SCREEN * DPR

    // Start looking at the middle of the map so the country is framed on load.
    cam.centerOn(options.bounds.x + options.bounds.width / 2, options.bounds.y + options.bounds.height / 2)

    // Mouse-wheel zoom, anchored so the world point under the cursor stays put.
    // Because zoom is centred on the camera midpoint, the world point under a
    // screen pixel `p` is `scroll + p/zoom` offset from the centre; holding it
    // fixed across a zoom change means shifting scroll by the closed-form
    // `(p - size/2)·(1/oldZoom - 1/newZoom)` on each axis. Computed directly (no
    // `getWorldPoint`, which reads a matrix Phaser only rebuilds at render time
    // and so would sample a stale transform mid-handler).
    scene.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (pointer: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
        const oldZoom = cam.zoom
        const factor = dy > 0 ? 1 / ZOOM.step : ZOOM.step
        const newZoom = Phaser.Math.Clamp(oldZoom * factor, ZOOM.min, ZOOM.max)
        if (newZoom === oldZoom) return
        const anchorScale = 1 / oldZoom - 1 / newZoom
        cam.setZoom(newZoom)
        cam.scrollX += (pointer.x - cam.width / 2) * anchorScale
        cam.scrollY += (pointer.y - cam.height / 2) * anchorScale
        this.clampCamera()
        this.onZoomChanged(newZoom)
      },
    )

    // Click-drag pan: while the pointer is held, move the camera 1:1 with the
    // cursor at the current zoom (divide the screen delta by zoom to get the world
    // delta). The pointer-move event fires constantly; the `isDown` check is
    // legitimate event filtering (only drag while a button is held), not a bail-out.
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return
      cam.scrollX -= (pointer.x - pointer.prevPosition.x) / cam.zoom
      cam.scrollY -= (pointer.y - pointer.prevPosition.y) / cam.zoom
      this.clampCamera()
    })

    // Keyboard pan keys. If the keyboard plugin is unavailable there is no safe
    // way to continue — fail fast rather than silently dropping keyboard control.
    const kb = scene.input.keyboard
    if (!kb) throw new Error('[CameraController] keyboard input unavailable')
    const K = Phaser.Input.Keyboard.KeyCodes
    this.moveKeys = {
      up: [kb.addKey(K.W), kb.addKey(K.UP)],
      down: [kb.addKey(K.S), kb.addKey(K.DOWN)],
      left: [kb.addKey(K.A), kb.addKey(K.LEFT)],
      right: [kb.addKey(K.D), kb.addKey(K.RIGHT)],
    }

    // Frame is already centred; make sure it starts inside the clamp range.
    this.clampCamera()
  }

  /**
   * Step the camera from held keys. Called once per frame with the elapsed time
   * in seconds. The on-screen pan speed is kept constant regardless of zoom by
   * converting the CSS-pixel speed into a world step via `screenPxToWorld`, so the
   * map slides under the cursor at the same visual rate whether zoomed in or out.
   */
  update(deltaSeconds: number): void {
    const keys = this.moveKeys
    const down = (group: Phaser.Input.Keyboard.Key[]) => group.some((k) => k.isDown)
    const dx = (down(keys.right) ? 1 : 0) - (down(keys.left) ? 1 : 0)
    const dy = (down(keys.down) ? 1 : 0) - (down(keys.up) ? 1 : 0)
    if (dx === 0 && dy === 0) return
    const step = screenPxToWorld(KEY_PAN_SPEED * deltaSeconds, this.cam.zoom)
    this.cam.scrollX += dx * step
    this.cam.scrollY += dy * step
    this.clampCamera()
  }

  /**
   * Confine the camera by clamping its CENTRE to the map's bounding box plus a
   * margin. Clamping the centre (rather than the top-left scroll minus the
   * viewport) makes the pannable region independent of zoom: the point the
   * camera looks at can roam anywhere within `map + margin` at every zoom level,
   * instead of the range shrinking as you zoom in. The scroll is then derived
   * back from the clamped centre.
   */
  private clampCamera(): void {
    const cam = this.cam
    const view = cameraWorldView(cam)

    // Fixed world region the camera centre may occupy (zoom-independent).
    const minCenterX = this.bounds.x - this.margin
    const maxCenterX = this.bounds.x + this.bounds.width + this.margin
    const minCenterY = this.bounds.y - this.margin
    const maxCenterY = this.bounds.y + this.bounds.height + this.margin

    const centerX = Phaser.Math.Clamp(view.centerX, minCenterX, maxCenterX)
    const centerY = Phaser.Math.Clamp(view.centerY, minCenterY, maxCenterY)

    // Derive scroll back from the clamped centre. Centre = scroll + size/2, so
    // scroll = centre - size/2 (Phaser's midpoint relation, not size/zoom).
    cam.scrollX = centerX - cam.width / 2
    cam.scrollY = centerY - cam.height / 2
  }
}
