import Phaser from 'phaser'
import { DPR, FONT_FAMILY, RADAR, DEPTH } from './config'
import { screenPxToWorld } from './units'
import type { ColocationLabel } from '../map/colocate'

export interface RadarMarker {
  name: string
  model: string
  label: string
  labelSuppressed: boolean
  x: number
  y: number
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

/** Renders radar-site markers (hollow circles) and their name+model labels. */
export class RadarLayer {
  private readonly scene: Phaser.Scene
  private readonly markers: readonly RadarMarker[]
  private readonly gfx: Phaser.GameObjects.Graphics
  private readonly labels: Phaser.GameObjects.Text[]
  private readonly suppressed: boolean[]
  /** Master on/off from the toolbar, independent of the label reveal. */
  private layerVisible = true

  constructor(scene: Phaser.Scene, markers: readonly RadarMarker[]) {
    assertMarkers(markers)
    this.scene = scene
    this.markers = markers
    this.suppressed = markers.map((m) => m.labelSuppressed)

    this.gfx = scene.add.graphics().setDepth(DEPTH.radarMarkers)
    this.labels = markers.map((m) => this.createLabel(m))

    // Draw once at the current zoom so the layer is correct before any input.
    this.onZoomChanged(this.currentZoom())
  }

  private createLabel(marker: RadarMarker): Phaser.GameObjects.Text {
    return this.scene.add
      .text(marker.x, marker.y, `${marker.label}\n${marker.model}`, {
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
      .setDepth(DEPTH.radarLabels)
  }

  private currentZoom(): number {
    return this.scene.cameras.main.zoom
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx, ...this.labels]
  }

  setVisible(visible: boolean): void {
    this.layerVisible = visible
    this.gfx.setVisible(visible)
    // Recompute labels for the new master state at the current zoom.
    this.onZoomChanged(this.currentZoom())
  }

  setLabels(labels: readonly ColocationLabel[]): void {
    if (labels.length !== this.labels.length) {
      fail(`expected ${this.labels.length} labels, got ${labels.length}`)
    }
    labels.forEach((l, i) => {
      this.labels[i].setText(`${l.label}\n${this.markers[i].model}`)
      this.suppressed[i] = l.suppressed
    })
    this.onZoomChanged(this.currentZoom())
  }

  /**
   * Re-derive everything zoom-dependent so the layer holds a constant on-screen
   * size: the circles and the labels. Cheap — a handful of sites — so it runs on
   * every zoom change. Kept as two focused passes below.
   */
  onZoomChanged(zoom: number): void {
    assertZoom(zoom)
    this.drawCircles(zoom)
    this.placeLabels(zoom)
  }

  /**
   * Re-draw every site's circle at a fixed on-screen radius/stroke. Always draws
   * all of them; the master on/off is handled by the Graphics' own visibility.
   */
  private drawCircles(zoom: number): void {
    const strokeWidth = screenPxToWorld(RADAR.strokeScreenWidth, zoom)
    const r = screenPxToWorld(RADAR.markerScreenRadius, zoom)

    this.gfx.clear()
    this.gfx.lineStyle(strokeWidth, RADAR.color, 1)
    for (const m of this.markers) {
      this.gfx.strokeCircle(m.x, m.y, r)
    }
  }

  private placeLabels(zoom: number): void {
    const labelOffset = screenPxToWorld(RADAR.markerScreenRadius + RADAR.labelScreenGap, zoom)
    const revealed = this.layerVisible && zoom >= RADAR.labelRevealZoom

    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i]
      const label = this.labels[i]
      const show = revealed && !this.suppressed[i]
      label.setVisible(show)
      if (show) {
        label.setScale(1 / zoom).setPosition(m.x, m.y - labelOffset)
      }
    }
  }
}
