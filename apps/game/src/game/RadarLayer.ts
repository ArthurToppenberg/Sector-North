import Phaser from 'phaser'
import { makeFail, type Fail } from './fail'
import { DPR, FONT_FAMILY, RADAR, CLICK_MAX_TRAVEL_SCREEN, DEPTH } from './config'
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

/**
 * Notified when a radar site is clicked (not dragged). Carries the marker's index
 * so the scene can look up the full radar record for its detail window. The layer
 * stays decoupled from the window itself — same split as the toolbar's `onToggle`.
 */
export type RadarSelectHandler = (index: number) => void

const fail: Fail = makeFail('game/RadarLayer')

function assertZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) fail(`zoom must be finite and > 0, got ${zoom}`)
  return zoom
}

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

export class RadarLayer {
  private readonly scene: Phaser.Scene
  private readonly markers: readonly RadarMarker[]
  private readonly gfx: Phaser.GameObjects.Graphics
  private readonly labels: Phaser.GameObjects.Text[]
  /** One invisible interactive hit target per site, for click-to-open. */
  private readonly hitZones: Phaser.GameObjects.Zone[]
  private readonly suppressed: boolean[]
  /** Master on/off from the toolbar, independent of the label reveal. */
  private layerVisible = true

  constructor(scene: Phaser.Scene, markers: readonly RadarMarker[], onSelect: RadarSelectHandler) {
    assertMarkers(markers)
    this.scene = scene
    this.markers = markers
    this.suppressed = markers.map((m) => m.labelSuppressed)

    this.gfx = scene.add.graphics().setDepth(DEPTH.radarMarkers)
    this.labels = markers.map((m) => this.createLabel(m))
    this.hitZones = markers.map((m, i) => this.createHitZone(m, i, onSelect))

    this.onZoomChanged(this.currentZoom())
  }

  /**
   * An invisible, interactive click target centred on the site. Distinguishes a
   * click from a drag by pointer travel (press → release): only a near-stationary
   * release counts as a click, so a camera pan that happens to end over a site
   * never opens its window.
   */
  private createHitZone(marker: RadarMarker, index: number, onSelect: RadarSelectHandler): Phaser.GameObjects.Zone {
    const zone = this.scene.add
      .zone(marker.x, marker.y, 1, 1)
      .setDepth(DEPTH.radarMarkers)
      .setInteractive({ useHandCursor: true })
    zone.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      const travel = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY)
      if (travel > CLICK_MAX_TRAVEL_SCREEN * DPR) return
      onSelect(index)
    })
    return zone
  }

  private createLabel(marker: RadarMarker): Phaser.GameObjects.Text {
    return this.scene.add
      .text(marker.x, marker.y, `${marker.label}\n${marker.model}`, {
        fontFamily: FONT_FAMILY,
        fontStyle: '500',
        fontSize: `${RADAR.labelScreenSize * DPR}px`,
        color: RADAR.labelColor,
        align: 'center',
        resolution: DPR,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.radarLabels)
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
    // A hidden radar layer must not be clickable — toggle each hit target's input
    // alongside the visuals so you can't open a window for an unseen site.
    for (const zone of this.hitZones) {
      if (visible) zone.setInteractive({ useHandCursor: true })
      else zone.disableInteractive()
    }
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
    assertZoom(zoom)
    this.drawCircles(zoom)
    this.placeLabels(zoom)
    this.sizeHitZones(zoom)
  }

  /**
   * Hold each click target at a constant on-screen size. `Zone.setSize` resizes
   * the rectangular input hit area too, so the clickable patch tracks the marker
   * rather than growing/shrinking with the world as you zoom.
   */
  private sizeHitZones(zoom: number): void {
    const size = screenPxToWorld(RADAR.hitTargetScreenSize, zoom)
    for (const zone of this.hitZones) zone.setSize(size, size)
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
