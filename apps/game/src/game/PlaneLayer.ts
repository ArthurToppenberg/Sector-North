import Phaser from 'phaser'
import { PLANE, DEPTH } from './config'
import { screenPxToWorld } from './units'

/** A radar return painted at a world-pixel point, fading out over `PLANE.blipFadeSec`. */
interface Blip {
  x: number
  y: number
  /** Seconds since the sweep painted this contact. */
  age: number
}

function fail(message: string): never {
  throw new Error(`[game/PlaneLayer] ${message}`)
}

/**
 * Draws radar contact blips. Aircraft themselves live in the world model and are
 * never drawn directly here — the player only sees a blip where a radar sweep
 * crossed one (fed in via `addContacts`), which then fades. This is the
 * every-frame / animated reaction pattern (like `RadarSweepLayer`): it redraws
 * each tick because its content is intrinsically time-varying, and its geometry
 * is world-space so blips stay glued to the ground as the camera pans/zooms —
 * only the on-screen dot size is re-derived per frame to stay constant.
 */
export class PlaneLayer {
  private readonly gfx: Phaser.GameObjects.Graphics
  private readonly blips: Blip[] = []
  private layerVisible = true

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(DEPTH.planeBlips)
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx]
  }

  setVisible(visible: boolean): void {
    this.layerVisible = visible
    this.gfx.setVisible(visible)
  }

  /** Paint fresh contacts (world-pixel points) reported by the radar sweep this frame. */
  addContacts(contacts: ReadonlyArray<{ x: number; y: number }>): void {
    for (const c of contacts) {
      if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) {
        fail(`contact has a non-finite position (${c.x}, ${c.y})`)
      }
      this.blips.push({ x: c.x, y: c.y, age: 0 })
    }
  }

  /**
   * Age every blip by `deltaSec`, drop the fully faded ones, and redraw the rest
   * with opacity falling off by age. Ageing/pruning run even while hidden so the
   * set stays bounded; drawing is skipped when the layer is off.
   */
  update(deltaSec: number, zoom: number): void {
    if (!Number.isFinite(deltaSec) || deltaSec < 0) fail(`deltaSec must be finite and >= 0, got ${deltaSec}`)

    let kept = 0
    for (const blip of this.blips) {
      blip.age += deltaSec
      if (blip.age < PLANE.blipFadeSec) this.blips[kept++] = blip
    }
    this.blips.length = kept

    if (!this.layerVisible) return

    const radius = screenPxToWorld(PLANE.blipScreenRadius, zoom)
    this.gfx.clear()
    for (const blip of this.blips) {
      const alpha = (1 - blip.age / PLANE.blipFadeSec) * PLANE.blipMaxAlpha
      this.gfx.fillStyle(PLANE.blipColor, alpha)
      this.gfx.fillCircle(blip.x, blip.y, radius)
    }
  }
}
