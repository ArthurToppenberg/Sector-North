import Phaser from 'phaser'
import { DEPTH, MAP } from './config'
import { screenPxToWorld } from './units'

function fail(message: string): never {
  throw new Error(`[game/CoastlineLayer] ${message}`)
}

/**
 * Renders the country's coastline as a crisp vector outline in world space.
 *
 * Single-responsibility layer extracted from the former god-scene: it owns one
 * world-space Graphics object and knows how to (re)stroke the coastline rings so
 * the outline always appears as a fine hairline on screen. Drawing vectors —
 * rather than baking a texture — keeps the line sharp at any zoom, and the camera
 * transform makes pan/zoom free with no per-frame re-tessellation.
 */
export class CoastlineLayer {
  /**
   * Projected coastline rings in world (device-pixel) space. Each entry is a
   * single ring stored as interleaved `[x0, y0, x1, y1, ...]` coordinates. Kept
   * so the outline can be re-stroked whenever the camera zoom changes.
   */
  private readonly rings: readonly Float32Array[]

  /**
   * World-space vector Graphics holding the coastline. Lives in world space so it
   * pans and zooms with the map; `onZoomChanged` compensates the line width so
   * the rendered stroke stays a constant thickness on screen.
   */
  private readonly gfx: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene, rings: readonly Float32Array[]) {
    if (rings.length === 0) fail('no coastline rings to draw')
    for (let i = 0; i < rings.length; i++) {
      const length = rings[i].length
      // Rings are interleaved x/y pairs, so an even count is structural; a ring
      // needs at least two points (4 values) to stroke a segment. Anything else
      // is a malformed projection buffer we want to see immediately.
      if (length < 4 || length % 2 !== 0) {
        fail(`ring ${i} has an invalid coordinate count (${length})`)
      }
    }
    this.rings = rings
    this.gfx = scene.add.graphics().setDepth(DEPTH.coastline)

    // Draw once at the current zoom so the layer is fully rendered the moment it
    // exists — no separate "first draw" step for the caller to remember.
    this.onZoomChanged(scene.cameras.main.zoom)
  }

  /**
   * The renderable objects owned by this layer. The scene uses this to route
   * which camera draws (or ignores) the coastline, keeping the HUD camera clean.
   */
  get objects(): readonly Phaser.GameObjects.GameObject[] {
    return [this.gfx]
  }

  /**
   * Re-stroke the coastline at a world-space line width that cancels out the
   * current camera zoom, so the outline always renders at `MAP.strokeScreenWidth`
   * CSS pixels on screen regardless of how far the player has zoomed in or out.
   * Cheap enough to run on every zoom change.
   */
  onZoomChanged(zoom: number): void {
    if (!Number.isFinite(zoom) || zoom <= 0) fail(`invalid camera zoom: ${zoom}`)

    const worldWidth = screenPxToWorld(MAP.strokeScreenWidth, zoom)
    this.gfx.clear()
    this.gfx.lineStyle(worldWidth, MAP.strokeColor, 1)
    for (const points of this.rings) {
      this.gfx.beginPath()
      this.gfx.moveTo(points[0], points[1])
      for (let i = 2; i < points.length; i += 2) {
        this.gfx.lineTo(points[i], points[i + 1])
      }
      this.gfx.closePath()
      this.gfx.strokePath()
    }
  }
}
