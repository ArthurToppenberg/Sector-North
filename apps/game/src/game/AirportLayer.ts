import Phaser from 'phaser'
import { DPR, FONT_FAMILY, AIRPORT, DEPTH } from './config'
import { screenPxToWorld } from './units'
import { log } from '../log/logger'
import type { AirportTier } from '../map/airports'
import type { ColocationLabel } from '../map/colocate'

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

/**
 * Horizontal half-width of an equilateral triangle as a fraction of its
 * circumradius (`sin 60° ≈ 0.866`). A fixed geometric constant of the glyph
 * shape — not a tunable size — so it lives here, not in config.
 */
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

function fail(message: string): never {
  throw new Error(`[game/AirportLayer] ${message}`)
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
 * refuse to render it rather than drawing garbage at a bogus point. Likewise a
 * missing name or unknown tier is a build/wiring bug we surface immediately.
 */
function assertMarkers(markers: readonly AirportMarker[]): void {
  if (markers.length === 0) fail('expected at least one airport marker')
  markers.forEach((m, i) => {
    if (typeof m.name !== 'string' || m.name.length === 0) fail(`marker ${i} has no name`)
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) {
      fail(`marker ${m.name} has a non-finite projected position (${m.x}, ${m.y})`)
    }
    if (!Number.isFinite(m.lon) || !Number.isFinite(m.lat)) {
      fail(`marker ${m.name} has a non-finite lon/lat (${m.lon}, ${m.lat})`)
    }
    if (!TIERS.includes(m.tier)) fail(`marker ${m.name} has unknown tier: ${JSON.stringify(m.tier)}`)
  })
}

/** Renders airfield markers (triangle glyphs) and their name labels. */
export class AirportLayer {
  private readonly markers: readonly AirportMarker[]
  private readonly gfx: Phaser.GameObjects.Graphics
  private readonly labels: Phaser.GameObjects.Text[]
  private readonly suppressed: boolean[]
  private layerVisible = true

  constructor(scene: Phaser.Scene, markers: readonly AirportMarker[]) {
    assertMarkers(markers)
    this.markers = markers
    this.suppressed = markers.map((m) => m.labelSuppressed)

    this.gfx = scene.add.graphics().setDepth(DEPTH.airportMarkers)

    this.labels = markers.map((m) =>
      scene.add
        .text(m.x, m.y, m.label, {
          fontFamily: FONT_FAMILY,
          fontStyle: '500',
          fontSize: `${AIRPORT.labelScreenSize * DPR}px`,
          color: AIRPORT.labelColor,
          // Rasterise at device resolution so labels stay crisp on HiDPI displays.
          resolution: DPR,
        })
        // Anchor bottom-centre so the label sits above its marker, centred on it.
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.airportLabels),
    )

    // Draw once at the current zoom so the layer is correct before any input.
    this.onZoomChanged(scene.cameras.main.zoom)

    log.debug(`AirportLayer: ${this.markers.length} airfield markers`)
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx, ...this.labels]
  }

  setVisible(visible: boolean): void {
    this.layerVisible = visible
    this.gfx.setVisible(visible)
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
    assertZoom(zoom)
    this.drawMarkers(zoom)
    this.layoutLabels(zoom)
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
