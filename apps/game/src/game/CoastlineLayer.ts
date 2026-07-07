import Phaser from 'phaser'
import { DEPTH, MAP } from './config'
import { screenPxToWorld } from './units'

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
  private readonly polygons: Float32Array[]

  /**
   * World-space vector Graphics holding the coastline. Lives in world space so it
   * pans and zooms with the map; `onZoomChanged` compensates the line width so
   * the rendered stroke stays a constant thickness on screen.
   */
  private readonly gfx: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene, polygons: Float32Array[]) {
    this.polygons = polygons
    this.gfx = scene.add.graphics().setDepth(DEPTH.coastline)

    // Draw once at the current zoom so the layer is fully rendered the moment it
    // exists — no separate "first draw" step for the caller to remember.
    this.onZoomChanged(scene.cameras.main.zoom)
  }

  /**
   * The renderable objects owned by this layer. The scene uses this to route
   * which camera draws (or ignores) the coastline, keeping the HUD camera clean.
   */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx]
  }

  /**
   * Re-stroke the coastline at a world-space line width that cancels out the
   * current camera zoom, so the outline always renders at `MAP.strokeScreenWidth`
   * CSS pixels on screen regardless of how far the player has zoomed in or out.
   * Cheap enough to run on every zoom change.
   */
  onZoomChanged(zoom: number): void {
    const worldWidth = screenPxToWorld(MAP.strokeScreenWidth, zoom)
    this.gfx.clear()
    this.gfx.lineStyle(worldWidth, MAP.strokeColor, 1)
    for (const points of this.polygons) {
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
