import Phaser from 'phaser'
import { DEPTH, GRID } from './config'
import { cameraWorldView, screenPxToWorld, smoothstep } from './units'

/** What the grid needs from the projection to place itself in world space. */
export interface GridConfig {
  /** Device pixels per real-world kilometre in the current projection. */
  pixelsPerKm: number
  /**
   * Geographic anchor (device px) the grid lines align to — a true lon/lat
   * point (the map's top-left corner), so cells stay locked to the ground.
   */
  origin: { x: number; y: number }
}

/**
 * A faint reference grid whose cells are a fixed real-world size (see
 * `GRID.cellKm`). Unlike the coastline and city layers — whose content is fixed
 * in world space and only reacts to zoom — the grid is *viewport*-reactive: it
 * draws only the slice currently on screen and so must be redrawn whenever the
 * camera moves at all (pan or zoom). Drawing just the visible slice keeps the
 * line count bounded no matter how far the world extends.
 *
 * The layer owns the "cell = N km" concept: callers pass the projection's
 * `pixelsPerKm` and the anchor, not a pre-computed pixel spacing.
 */
export class GridLayer {
  /** World-space (device px) size of one grid cell. */
  private readonly spacing: number
  /** Geographic anchor (device px) the lines snap to. */
  private readonly origin: { x: number; y: number }
  /** World-space Graphics for the grid; redrawn each frame from the camera. */
  private readonly gfx: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene, config: GridConfig) {
    this.spacing = GRID.cellKm * config.pixelsPerKm
    // A non-positive spacing would make the redraw loops never advance (or spin
    // forever). That can only happen if the projection scale is broken, so fail
    // loudly rather than hang.
    if (!(this.spacing > 0)) {
      throw new Error(`[GridLayer] non-positive grid spacing from pixelsPerKm=${config.pixelsPerKm}`)
    }
    this.origin = config.origin
    // The bottom-most layer: every other layer draws over the grid so it reads
    // as a backdrop. Draw order is declared centrally in DEPTH.
    this.gfx = scene.add.graphics().setDepth(DEPTH.grid)
  }

  /**
   * The renderable objects owned by this layer, so the scene can route which
   * camera draws the grid (world camera only, never the fixed HUD camera).
   */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx]
  }

  /**
   * Redraw the visible slice of the grid from the camera's current viewport,
   * snapping lines to the geographic anchor so cells stay locked to the ground
   * as the camera pans. The stroke width cancels zoom to hold a constant faint
   * hairline on screen.
   */
  redraw(cam: Phaser.Cameras.Scene2D.Camera): void {
    const zoom = cam.zoom
    const step = this.spacing

    this.gfx.clear()

    // Fade the grid in with zoom (see GRID.fadeStartZoom/fadeEndZoom). Fully
    // faded out below the band there is nothing to draw — bail before the line
    // loops so we don't stroke a screenful of invisible lines every frame.
    const alpha = GRID.maxAlpha * smoothstep(GRID.fadeStartZoom, GRID.fadeEndZoom, zoom)
    if (alpha <= 0) return

    // Visible world rectangle (device px). Derived via cameraWorldView so it is
    // correct at every zoom — the view is centred on `scroll + size/2`, NOT
    // anchored at `scroll` (that mistake left the grid clipped when zoomed in).
    const { left, top, right, bottom } = cameraWorldView(cam)

    // First grid line at or before each edge, measured from the anchor.
    const startX = Math.floor((left - this.origin.x) / step) * step + this.origin.x
    const startY = Math.floor((top - this.origin.y) / step) * step + this.origin.y

    this.gfx.lineStyle(screenPxToWorld(GRID.strokeScreenWidth, zoom), GRID.color, alpha)
    for (let x = startX; x <= right; x += step) {
      this.gfx.lineBetween(x, top, x, bottom)
    }
    for (let y = startY; y <= bottom; y += step) {
      this.gfx.lineBetween(left, y, right, y)
    }
  }
}
