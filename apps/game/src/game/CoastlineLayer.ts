import Phaser from 'phaser'
import { DEPTH, MAP } from './config'
import { screenPxToWorld } from './units'

function fail(message: string): never {
  throw new Error(`[game/CoastlineLayer] ${message}`)
}

/**
 * Validate the projected coastline rings up front. Rings are interleaved x/y
 * pairs, so an even count is structural and a ring needs at least two points
 * (4 values) to stroke a segment. Anything else is a malformed projection
 * buffer we want to see immediately, so this throws rather than drawing garbage.
 */
function assertValidRings(rings: readonly Float32Array[]): void {
  if (rings.length === 0) fail('no coastline rings to draw')
  for (let i = 0; i < rings.length; i++) {
    const length = rings[i].length
    if (length < 4 || length % 2 !== 0) {
      fail(`ring ${i} has an invalid coordinate count (${length})`)
    }
  }
}

/**
 * Renders the country coastline as a world-space vector outline.
 */
export class CoastlineLayer {
  private readonly rings: readonly Float32Array[]

  private readonly gfx: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene, rings: readonly Float32Array[]) {
    assertValidRings(rings)
    this.rings = rings
    this.gfx = scene.add.graphics().setDepth(DEPTH.coastline)

    // Draw once at the current zoom so the layer is fully rendered the moment it
    // exists — no separate "first draw" step for the caller to remember.
    this.onZoomChanged(scene.cameras.main.zoom)
  }

  get objects(): readonly Phaser.GameObjects.GameObject[] {
    return [this.gfx]
  }

  onZoomChanged(zoom: number): void {
    if (!Number.isFinite(zoom) || zoom <= 0) fail(`invalid camera zoom: ${zoom}`)

    const worldWidth = screenPxToWorld(MAP.strokeScreenWidth, zoom)
    this.gfx.clear()
    this.gfx.lineStyle(worldWidth, MAP.strokeColor, 1)
    for (const ring of this.rings) {
      this.strokeRing(ring)
    }
  }

  /**
   * Stroke a single closed ring using the line style already set on `gfx`.
   * Assumes a validated ring (see `assertValidRings`).
   */
  private strokeRing(points: Float32Array): void {
    this.gfx.beginPath()
    this.gfx.moveTo(points[0], points[1])
    for (let i = 2; i < points.length; i += 2) {
      this.gfx.lineTo(points[i], points[i + 1])
    }
    this.gfx.closePath()
    this.gfx.strokePath()
  }
}
