import Phaser from 'phaser'
import { DPR, FONT_FAMILY, CITY, DEPTH } from './config'
import { screenPxToWorld } from './units'

/**
 * A city placed in world space (device px), ready to render.
 *
 * The projected `x/y` are what this layer draws, but the real lon/lat and
 * population are carried alongside — never discarded — because GPS is the
 * source of truth (see README). Later milestones (aircraft targeting cities,
 * re-projection, sizing dots by population) need the ground truth, not the
 * pixels derived from it.
 */
export interface CityMarker {
  name: string
  /** Projected device-pixel position (derived from lon/lat for the current fit). */
  x: number
  y: number
  /** Real-world coordinates in lon/lat degrees — the source of truth. */
  lon: number
  lat: number
  population: number
}

/**
 * Renders the city markers — a filled dot plus a name label per city — as a
 * single self-contained layer.
 *
 * Everything lives in world space so it pans and zooms with the map, but the
 * dots and labels are re-derived on every zoom change so they render at a
 * *constant on-screen size* (like the coastline hairline) instead of ballooning
 * or vanishing as the player zooms.
 */
export class CityLayer {
  private readonly markers: CityMarker[]
  /** World-space Graphics holding every city dot; re-drawn on zoom. */
  private readonly gfx: Phaser.GameObjects.Graphics
  /** One world-space Text label per city; re-positioned/re-scaled on zoom. */
  private readonly labels: Phaser.GameObjects.Text[]

  constructor(scene: Phaser.Scene, markers: CityMarker[]) {
    this.markers = markers

    // Dots sit just above the coastline; labels just above the dots (draw order
    // declared centrally in DEPTH).
    this.gfx = scene.add.graphics().setDepth(DEPTH.cityDots)

    this.labels = markers.map((m) =>
      scene.add
        .text(m.x, m.y, m.name, {
          fontFamily: FONT_FAMILY,
          fontStyle: '600',
          fontSize: `${CITY.labelScreenSize * DPR}px`,
          color: CITY.labelColor,
          // Rasterise at device resolution so labels stay crisp on HiDPI displays.
          resolution: DPR,
        })
        // Anchor bottom-centre so the label sits above its city, centred on the dot.
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.cityLabels),
    )

    // Draw once at the current zoom so the layer is correct before any input.
    this.onZoomChanged(scene.cameras.main.zoom)
  }

  /**
   * Every game object this layer owns, so the scene can hand them to the
   * appropriate camera (e.g. tell the fixed UI camera to ignore them).
   */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx, ...this.labels]
  }

  /**
   * Show or hide the whole city layer — both the dots and their name labels.
   * Driven by the HUD toolbar toggle. Visibility is independent of the
   * zoom-reactive re-positioning in `onZoomChanged`, which only touches
   * scale/position — so a hidden marker stays hidden across zooms.
   */
  setVisible(visible: boolean): void {
    this.gfx.setVisible(visible)
    for (const label of this.labels) label.setVisible(visible)
  }

  /**
   * Re-draw the dots and re-place/scale the labels so each renders at a fixed
   * on-screen size regardless of camera zoom. Cheap — a handful of cities — so
   * it runs on every zoom change.
   */
  onZoomChanged(zoom: number): void {
    // Constant on-screen sizes converted to world units at the current zoom.
    const dotRadius = screenPxToWorld(CITY.dotScreenRadius, zoom)
    const labelOffset = screenPxToWorld(CITY.dotScreenRadius + CITY.labelScreenGap, zoom)

    this.gfx.clear()
    this.gfx.fillStyle(CITY.dotColor, 1)
    for (const m of this.markers) {
      this.gfx.fillCircle(m.x, m.y, dotRadius)
    }

    for (let i = 0; i < this.labels.length; i++) {
      const m = this.markers[i]
      this.labels[i].setScale(1 / zoom).setPosition(m.x, m.y - labelOffset)
    }
  }
}
