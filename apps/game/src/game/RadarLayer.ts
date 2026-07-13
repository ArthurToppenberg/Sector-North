import Phaser from 'phaser'
import { makeFail, type Fail } from './fail'
import { RADAR, DEPTH } from './config'
import { screenPxToWorld } from './units'
import type { ColocationLabel } from '../map/colocate'
import {
  assertZoom,
  assertMarkers,
  createHitZone,
  setHitZonesInteractive,
  sizeHitZones,
  createMarkerLabel,
  type SelectHandler,
  type WorldLayer,
  type ZoomReactive,
  type ToggleableLayer,
} from './layerHelpers'

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

const fail: Fail = makeFail('game/RadarLayer')

export class RadarLayer implements WorldLayer, ZoomReactive, ToggleableLayer {
  private readonly scene: Phaser.Scene
  private readonly markers: readonly RadarMarker[]
  private readonly gfx: Phaser.GameObjects.Graphics
  private readonly labels: Phaser.GameObjects.Text[]
  /** One invisible interactive hit target per site, for click-to-open. */
  private readonly hitZones: Phaser.GameObjects.Zone[]
  private readonly suppressed: boolean[]
  /** Master on/off from the toolbar, independent of the label reveal. */
  private layerVisible = true

  constructor(scene: Phaser.Scene, markers: readonly RadarMarker[], onSelect: SelectHandler) {
    assertMarkers(markers, fail, 'radar', (m) => {
      if (typeof m.model !== 'string' || m.model.length === 0) fail(`marker ${m.name} has no model`)
    })
    this.scene = scene
    this.markers = markers
    this.suppressed = markers.map((m) => m.labelSuppressed)

    this.gfx = scene.add.graphics().setDepth(DEPTH.radarMarkers)
    this.labels = markers.map((m) => this.createLabel(m))
    this.hitZones = markers.map((m, i) => createHitZone(scene, m.x, m.y, DEPTH.radarMarkers, i, onSelect))

    this.onZoomChanged(this.currentZoom())
  }

  private createLabel(marker: RadarMarker): Phaser.GameObjects.Text {
    return createMarkerLabel(
      this.scene,
      marker.x,
      marker.y,
      `${marker.label}\n${marker.model}`,
      {
        fontWeight: '500',
        screenSize: RADAR.labelScreenSize,
        color: RADAR.labelColor,
        align: 'center',
      },
      DEPTH.radarLabels,
    )
  }

  private currentZoom(): number {
    return this.scene.cameras.main.zoom
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx, ...this.labels, ...this.hitZones]
  }

  setVisible(visible: boolean): void {
    this.layerVisible = visible
    this.gfx.setVisible(visible)
    setHitZonesInteractive(this.hitZones, visible)
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
   * size. Cheap — a handful of sites — so it runs on every zoom change.
   */
  onZoomChanged(zoom: number): void {
    assertZoom(zoom, fail)
    this.drawCircles(zoom)
    this.placeLabels(zoom)
    sizeHitZones(this.hitZones, RADAR.hitTargetScreenSize, zoom)
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
