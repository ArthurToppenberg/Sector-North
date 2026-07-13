import Phaser from 'phaser'
import { DEPTH, GRID } from './config'
import { screenPxToWorld } from './units'
import { cameraWorldView, type WorldView } from './camera'
import type { WorldLayer } from './layerHelpers'
import { smoothstep } from './math'

function firstLineAtOrBefore(edge: number, anchor: number, step: number): number {
  return Math.floor((edge - anchor) / step) * step + anchor
}

export interface GridConfig {
  /** Device pixels per real-world kilometre in the current projection. */
  pixelsPerKm: number
  origin: { x: number; y: number }
}

/** Faint real-world reference grid drawn beneath the map. */
export class GridLayer implements WorldLayer {
  private readonly spacing: number
  private readonly origin: { x: number; y: number }
  private readonly gfx: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene, config: GridConfig) {
    const { pixelsPerKm, origin } = config

    // Validate the projection inputs up front and throw on anything unexpected —
    // these can only be wrong if the projection itself is broken, and a broken
    // grid must crash loudly, never draw silently-wrong or blank.
    //   - A non-finite or non-positive scale would make the redraw loops never
    //     advance (zero/NaN step) or spin forever (negative step).
    //   - A non-finite origin would poison every snapped line into NaN, drawing
    //     nothing at all while masking the fault.
    if (!Number.isFinite(pixelsPerKm) || pixelsPerKm <= 0) {
      throw new Error(`[GridLayer] pixelsPerKm must be a positive finite number, got ${pixelsPerKm}`)
    }
    if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) {
      throw new Error(`[GridLayer] origin must be finite, got (${origin.x}, ${origin.y})`)
    }

    this.spacing = GRID.cellKm * pixelsPerKm
    this.origin = origin
    // The bottom-most layer: every other layer draws over the grid so it reads
    // as a backdrop. Draw order is declared centrally in DEPTH.
    this.gfx = scene.add.graphics().setDepth(DEPTH.grid)
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx]
  }

  redraw(cam: Phaser.Cameras.Scene2D.Camera): void {
    this.gfx.clear()

    // Fade the grid in with zoom (see GRID.fadeStartZoom/fadeEndZoom). Fully
    // faded out below the band there is nothing to draw — bail before the line
    // loops so we don't stroke a screenful of invisible lines every frame.
    const alpha = GRID.maxAlpha * smoothstep(GRID.fadeStartZoom, GRID.fadeEndZoom, cam.zoom)
    if (alpha <= 0) return

    // Visible world rectangle (device px). Derived via cameraWorldView so it is
    // correct at every zoom — the view is centred on `scroll + size/2`, NOT
    // anchored at `scroll` (that mistake left the grid clipped when zoomed in).
    const view = cameraWorldView(cam)

    this.gfx.lineStyle(screenPxToWorld(GRID.strokeScreenWidth, cam.zoom), GRID.color, alpha)
    this.drawLattice(view)
  }

  private drawLattice({ left, top, right, bottom }: WorldView): void {
    const step = this.spacing
    for (let x = firstLineAtOrBefore(left, this.origin.x, step); x <= right; x += step) {
      this.gfx.lineBetween(x, top, x, bottom)
    }
    for (let y = firstLineAtOrBefore(top, this.origin.y, step); y <= bottom; y += step) {
      this.gfx.lineBetween(left, y, right, y)
    }
  }
}
