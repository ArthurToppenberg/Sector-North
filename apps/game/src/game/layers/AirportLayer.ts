import Phaser from 'phaser'
import { makeFail, type Fail } from '../fail'
import { AIRPORT, DEPTH } from '../config'
import { screenPxToWorld } from '../units'
import type { AirportTier } from '../../map/airports'
import type { ColocationLabel } from '../../map/colocate'
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
} from './helpers'

export interface AirportMarker {
  name: string
  label: string
  labelSuppressed: boolean
  x: number
  y: number
  lon: number
  lat: number
  tier: AirportTier
}

const TIERS: readonly AirportTier[] = ['military', 'major', 'minor']

// Horizontal half-width of an equilateral triangle as a fraction of its circumradius.
const TRIANGLE_HALF_WIDTH_RATIO = Math.sin(Math.PI / 3)

interface Point {
  readonly x: number
  readonly y: number
}

function triangleVertices(x: number, y: number, r: number): readonly [Point, Point, Point] {
  const halfWidth = r * TRIANGLE_HALF_WIDTH_RATIO
  const halfHeight = r / 2 // inradius: how far the base sits below the centre
  return [
    { x, y: y - r },
    { x: x - halfWidth, y: y + halfHeight },
    { x: x + halfWidth, y: y + halfHeight },
  ]
}

const fail: Fail = makeFail('game/AirportLayer')

/** Renders airfield markers (triangle glyphs) and their name labels. */
export class AirportLayer implements WorldLayer, ZoomReactive, ToggleableLayer {
  private readonly markers: readonly AirportMarker[]
  private readonly gfx: Phaser.GameObjects.Graphics
  private readonly labels: Phaser.GameObjects.Text[]
  /** One invisible interactive hit target per airfield, for click-to-open. */
  private readonly hitZones: Phaser.GameObjects.Zone[]
  private readonly suppressed: boolean[]
  private layerVisible = true

  constructor(scene: Phaser.Scene, markers: readonly AirportMarker[], onSelect: SelectHandler) {
    assertMarkers(markers, fail, 'airport', (m) => {
      if (!TIERS.includes(m.tier)) fail(`marker ${m.name} has unknown tier: ${JSON.stringify(m.tier)}`)
    })
    this.markers = markers
    this.suppressed = markers.map((m) => m.labelSuppressed)

    this.gfx = scene.add.graphics().setDepth(DEPTH.airportMarkers)
    this.hitZones = markers.map((m, i) => createHitZone(scene, m.x, m.y, DEPTH.airportMarkers, i, onSelect))

    this.labels = markers.map((m) =>
      createMarkerLabel(
        scene,
        m.x,
        m.y,
        m.label,
        { fontWeight: '500', screenSize: AIRPORT.labelScreenSize, color: AIRPORT.labelColor },
        DEPTH.airportLabels,
      ),
    )

    this.onZoomChanged(scene.cameras.main.zoom)
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx, ...this.labels, ...this.hitZones]
  }

  setVisible(visible: boolean): void {
    this.layerVisible = visible
    this.gfx.setVisible(visible)
    setHitZonesInteractive(this.hitZones, visible)
    // Recompute labels for the new master state at the current zoom.
    this.onZoomChanged(this.gfx.scene.cameras.main.zoom)
  }

  setLabels(labels: readonly ColocationLabel[]): void {
    if (labels.length !== this.labels.length) {
      fail(`expected ${this.labels.length} labels, got ${labels.length}`)
    }
    labels.forEach((l, i) => {
      this.labels[i].setText(l.label)
      this.suppressed[i] = l.suppressed
    })
    this.onZoomChanged(this.gfx.scene.cameras.main.zoom)
  }

  private labelRevealZoom(tier: AirportTier): number {
    return tier === 'minor' ? AIRPORT.minorLabelRevealZoom : AIRPORT.labelRevealZoom
  }

  private isLabelRevealed(index: number, zoom: number): boolean {
    if (!this.layerVisible || this.suppressed[index]) return false
    return zoom >= this.labelRevealZoom(this.markers[index].tier)
  }

  onZoomChanged(zoom: number): void {
    assertZoom(zoom, fail)
    this.drawMarkers(zoom)
    this.layoutLabels(zoom)
    sizeHitZones(this.hitZones, AIRPORT.hitTargetScreenSize, zoom)
  }

  private drawMarkers(zoom: number): void {
    // Constant on-screen stroke width converted to world units at this zoom. The
    // marker radius is per-tier, so it's resolved inside the loop instead.
    const strokeWidth = screenPxToWorld(AIRPORT.strokeScreenWidth, zoom)

    this.gfx.clear()
    this.gfx.fillStyle(AIRPORT.color, 1)
    this.gfx.lineStyle(strokeWidth, AIRPORT.color, 1)

    for (const m of this.markers) {
      const r = screenPxToWorld(AIRPORT.markerScreenRadius[m.tier], zoom)
      const [a, b, c] = triangleVertices(m.x, m.y, r)
      if (m.tier === 'military') {
        this.gfx.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y)
      } else {
        this.gfx.strokeTriangle(a.x, a.y, b.x, b.y, c.x, c.y)
      }
    }
  }

  private layoutLabels(zoom: number): void {
    for (let i = 0; i < this.markers.length; i++) {
      const label = this.labels[i]
      const show = this.isLabelRevealed(i, zoom)
      label.setVisible(show)
      if (!show) continue

      const m = this.markers[i]
      const labelOffset = screenPxToWorld(
        AIRPORT.markerScreenRadius[m.tier] + AIRPORT.labelScreenGap,
        zoom,
      )
      label.setScale(1 / zoom).setPosition(m.x, m.y - labelOffset)
    }
  }
}
