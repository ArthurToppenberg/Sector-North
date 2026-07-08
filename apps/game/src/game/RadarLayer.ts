import Phaser from 'phaser'
import { DPR, FONT_FAMILY, RADAR, DEPTH } from './config'
import { screenPxToWorld } from './units'
import type { ColocationLabel } from '../map/colocate'

/**
 * A radar site placed in world space (device px), ready to render.
 *
 * As with the cities and airfields, the projected `x/y` are what we draw, but the
 * real lon/lat is carried alongside so later milestones (radar coverage, aircraft
 * detection, re-projection) can work from the ground truth rather than the derived
 * pixels. `model` is the installed sensor, shown in the label.
 *
 * `label`/`labelSuppressed` come from the cross-type co-location pass: when a radar
 * shares an air base with an airfield the airfield carries the combined "A & B"
 * label and this radar's own label is suppressed (its circle still draws).
 */
export interface RadarMarker {
  name: string
  model: string
  /** Display label (own name, or suppressed in favour of a co-located airfield's combined label). */
  label: string
  /** True when a co-located airfield owns the shared label, so this radar hides its own. */
  labelSuppressed: boolean
  /** Projected device-pixel position (derived from lon/lat for the current fit). */
  x: number
  y: number
  /** Real-world coordinates in lon/lat degrees — the source of truth. */
  lon: number
  lat: number
}

function fail(message: string): never {
  throw new Error(`[game/RadarLayer] ${message}`)
}

/**
 * A usable camera zoom: finite and strictly positive. Every constant on-screen
 * size divides by it (via `screenPxToWorld`), so a zero/NaN/negative zoom would
 * silently produce Infinite/NaN geometry — fail loudly instead.
 */
function assertZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) fail(`zoom must be finite and > 0, got ${zoom}`)
  return zoom
}

/**
 * Validate the markers at the layer boundary. GPS is the source of truth, so a
 * marker with a non-finite projected position means the projection failed — we
 * refuse to render it rather than drawing garbage at a bogus point. A missing
 * name or model is a build/wiring bug we surface immediately.
 */
function assertMarkers(markers: readonly RadarMarker[]): void {
  if (markers.length === 0) fail('expected at least one radar marker')
  markers.forEach((m, i) => {
    if (typeof m.name !== 'string' || m.name.length === 0) fail(`marker ${i} has no name`)
    if (typeof m.model !== 'string' || m.model.length === 0) fail(`marker ${m.name} has no model`)
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) {
      fail(`marker ${m.name} has a non-finite projected position (${m.x}, ${m.y})`)
    }
    if (!Number.isFinite(m.lon) || !Number.isFinite(m.lat)) {
      fail(`marker ${m.name} has a non-finite lon/lat (${m.lon}, ${m.lat})`)
    }
  })
}

/**
 * Renders the radar sites — a small hollow circle per site, plus a name + model
 * label.
 *
 * Distinct from the city icons and airport triangles by *shape* (a circle),
 * staying inside the white/black HUD rule. Like those layers everything lives in
 * world space (so it pans/zooms with the map) but is re-derived on every zoom
 * change to hold a constant on-screen size.
 *
 * Every circle is always drawn while the layer is on. A label shows when the layer
 * is on, the camera is zoomed past `RADAR.labelRevealZoom`, and the label isn't
 * suppressed by a co-located airfield carrying the shared combined label.
 */
export class RadarLayer {
  private readonly markers: readonly RadarMarker[]
  /** World-space Graphics holding every site's circle; re-drawn on zoom. */
  private readonly gfx: Phaser.GameObjects.Graphics
  /** One world-space Text label (name + model) per site; re-placed/scaled on zoom. */
  private readonly labels: Phaser.GameObjects.Text[]
  /**
   * Per-marker label suppression: true when a co-located airfield owns the shared
   * label so this radar draws no name of its own. Mutable — recomputed via
   * `setLabels` whenever a layer is toggled (co-located counts depend on it).
   */
  private readonly suppressed: boolean[]
  /** Master on/off from the toolbar, independent of the label reveal. */
  private layerVisible = true

  constructor(scene: Phaser.Scene, markers: readonly RadarMarker[]) {
    assertMarkers(markers)
    this.markers = markers
    this.suppressed = markers.map((m) => m.labelSuppressed)

    this.gfx = scene.add.graphics().setDepth(DEPTH.radarMarkers)

    this.labels = markers.map((m) =>
      scene.add
        .text(m.x, m.y, `${m.label}\n${m.model}`, {
          fontFamily: FONT_FAMILY,
          fontStyle: '500',
          fontSize: `${RADAR.labelScreenSize * DPR}px`,
          color: RADAR.labelColor,
          align: 'center',
          // Rasterise at device resolution so labels stay crisp on HiDPI displays.
          resolution: DPR,
        })
        // Anchor bottom-centre so the label sits above its marker, centred on it.
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.radarLabels),
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
   * Show or hide the whole radar layer — circles and labels alike. This is the
   * master toggle; while on, the labels are still governed by the zoom reveal and
   * co-location suppression below, but every circle shows.
   */
  setVisible(visible: boolean): void {
    this.layerVisible = visible
    this.gfx.setVisible(visible)
    // Recompute labels for the new master state at the current zoom.
    this.onZoomChanged(this.gfx.scene.cameras.main.zoom)
  }

  /**
   * Replace every marker's label text + suppression from a co-location resolve
   * (recomputed whenever a layer is toggled, since a `+N` count depends on which
   * co-located sites are shown) and re-apply at the current zoom. The site's model
   * is re-appended on its own line. One result per marker, in marker order.
   */
  setLabels(labels: readonly ColocationLabel[]): void {
    if (labels.length !== this.labels.length) {
      fail(`expected ${this.labels.length} labels, got ${labels.length}`)
    }
    labels.forEach((l, i) => {
      this.labels[i].setText(`${l.label}\n${this.markers[i].model}`)
      this.suppressed[i] = l.suppressed
    })
    this.onZoomChanged(this.gfx.scene.cameras.main.zoom)
  }

  /**
   * Re-draw the circles (always all of them, while the layer is on) and
   * re-place/scale the labels so each renders at a fixed on-screen size, applying
   * the zoom reveal and co-location suppression. Cheap — a handful of sites — so
   * it runs on every zoom change.
   */
  onZoomChanged(zoom: number): void {
    assertZoom(zoom)

    const strokeWidth = screenPxToWorld(RADAR.strokeScreenWidth, zoom)
    const r = screenPxToWorld(RADAR.markerScreenRadius, zoom)
    const labelOffset = screenPxToWorld(RADAR.markerScreenRadius + RADAR.labelScreenGap, zoom)

    this.gfx.clear()
    this.gfx.lineStyle(strokeWidth, RADAR.color, 1)

    const revealed = this.layerVisible && zoom >= RADAR.labelRevealZoom

    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i]

      this.gfx.strokeCircle(m.x, m.y, r)

      const label = this.labels[i]
      const show = revealed && !this.suppressed[i]
      label.setVisible(show)
      if (show) {
        label.setScale(1 / zoom).setPosition(m.x, m.y - labelOffset)
      }
    }
  }
}
