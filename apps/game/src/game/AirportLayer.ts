import Phaser from 'phaser'
import { DPR, FONT_FAMILY, AIRPORT, DEPTH } from './config'
import { screenPxToWorld } from './units'
import type { AirportTier } from '../map/airports'

/**
 * An airfield placed in world space (device px), ready to render.
 *
 * As with cities, the projected `x/y` are what we draw, but the real lon/lat is
 * carried alongside so later milestones (aircraft routing to/from airfields,
 * re-projection) can work from the ground truth rather than the derived pixels.
 * `tier` drives the zoom-reveal and glyph.
 */
export interface AirportMarker {
  name: string
  /** Projected device-pixel position (derived from lon/lat for the current fit). */
  x: number
  y: number
  /** Real-world coordinates in lon/lat degrees — the source of truth. */
  lon: number
  lat: number
  tier: AirportTier
}

/**
 * Priority within a close cluster when deciding which single name to show:
 * lower rank wins. A military airbase beats a major airport, which beats a minor
 * field — so a co-located civil+military pair shows only the military name.
 */
const TIER_RANK: Record<AirportTier, number> = { military: 0, major: 1, minor: 2 }

/**
 * Horizontal half-width of an equilateral triangle as a fraction of its
 * circumradius (`sin 60° ≈ 0.866`). A fixed geometric constant of the glyph
 * shape — not a tunable size — so it lives here, not in config.
 */
const TRIANGLE_HALF_WIDTH_RATIO = Math.sin(Math.PI / 3)

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
    if (!(m.tier in TIER_RANK)) fail(`marker ${m.name} has unknown tier: ${JSON.stringify(m.tier)}`)
  })
}

/**
 * Renders the airfield markers — a triangle glyph per field, plus name labels.
 *
 * Distinct from the city markers by *shape* (triangle); within the airfields the
 * tiers read by *size* (major airports + military airbases draw large, minor
 * fields small) and by *fill* (military solid, civil hollow) — never by colour,
 * so it stays inside the white/black HUD rule. Like the cities everything lives
 * in world space (so it pans/zooms with the map) but is re-derived on every zoom
 * change to hold a constant on-screen size.
 *
 * Every triangle is always drawn while the layer is on. The *names* are managed
 * to avoid clutter:
 *  - Tiered reveal: major airports + military airbases label once the camera
 *    zooms past `AIRPORT.labelRevealZoom`; minor fields only past
 *    `AIRPORT.minorLabelRevealZoom` (closer in).
 *  - Cluster de-dup: when several fields fall within
 *    `AIRPORT.labelClusterScreenRadius` on screen, only the highest-priority
 *    one's name shows (military > major > minor). Zooming in separates them and
 *    the individual names reappear.
 */
export class AirportLayer {
  private readonly markers: readonly AirportMarker[]
  /** World-space Graphics holding every marker glyph; re-drawn on zoom. */
  private readonly gfx: Phaser.GameObjects.Graphics
  /** One world-space Text label per airfield; re-positioned/re-scaled on zoom. */
  private readonly labels: Phaser.GameObjects.Text[]
  /** Master on/off from the toolbar, independent of the label reveal/de-dup. */
  private layerVisible = true

  constructor(scene: Phaser.Scene, markers: readonly AirportMarker[]) {
    assertMarkers(markers)
    this.markers = markers

    this.gfx = scene.add.graphics().setDepth(DEPTH.airportMarkers)

    this.labels = markers.map((m) =>
      scene.add
        .text(m.x, m.y, m.name, {
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
  }

  /**
   * Every game object this layer owns, so the scene can hand them to the
   * appropriate camera (e.g. tell the fixed UI camera to ignore them).
   */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx, ...this.labels]
  }

  /**
   * Show or hide the whole airport layer — triangles and names alike. This is
   * the master toggle; while on, individual *names* are still governed by the
   * zoom reveal + cluster de-dup below, but every triangle shows.
   */
  setVisible(visible: boolean): void {
    this.layerVisible = visible
    this.gfx.setVisible(visible)
    // Recompute labels for the new master state at the current zoom.
    this.onZoomChanged(this.gfx.scene.cameras.main.zoom)
  }

  /** Lowest zoom at which this field is allowed to show its name (tiered reveal). */
  private labelRevealZoom(tier: AirportTier): number {
    return tier === 'minor' ? AIRPORT.minorLabelRevealZoom : AIRPORT.labelRevealZoom
  }

  /**
   * Decide which labels to show at this zoom: start from the fields whose tier
   * has been revealed, then greedily keep the highest-priority name in each
   * on-screen cluster and drop the rest. Returns the set of marker indices whose
   * label should be visible.
   */
  private visibleLabelIndices(zoom: number): Set<number> {
    const shown = new Set<number>()
    if (!this.layerVisible) return shown

    // Candidates: tier revealed at this zoom, ordered highest-priority first so
    // the greedy pass below keeps the right name when a cluster collides. Ties
    // break on index for a stable, deterministic choice.
    const candidates = [...this.markers.keys()]
      .filter((i) => zoom >= this.labelRevealZoom(this.markers[i].tier))
      .sort((a, b) => TIER_RANK[this.markers[a].tier] - TIER_RANK[this.markers[b].tier] || a - b)

    // Cluster radius is a constant on-screen distance → shrinks in world units as
    // the player zooms in, so crowded names separate out the closer you get.
    const radius = screenPxToWorld(AIRPORT.labelClusterScreenRadius, zoom)
    const radiusSq = radius * radius

    for (const i of candidates) {
      const m = this.markers[i]
      let clustered = false
      for (const j of shown) {
        const other = this.markers[j]
        const dx = m.x - other.x
        const dy = m.y - other.y
        if (dx * dx + dy * dy <= radiusSq) {
          clustered = true
          break
        }
      }
      if (!clustered) shown.add(i)
    }
    return shown
  }

  /**
   * Re-draw the triangles (always all of them, while the layer is on) and
   * re-place/scale the labels so each renders at a fixed on-screen size, applying
   * the tiered reveal + cluster de-dup. Cheap — a few dozen fields — so it runs
   * on every zoom change.
   */
  onZoomChanged(zoom: number): void {
    assertZoom(zoom)

    // Constant on-screen stroke width converted to world units at this zoom. The
    // marker radius is per-tier (large fields bigger than minor ones), so it's
    // resolved inside the loop rather than once here.
    const strokeWidth = screenPxToWorld(AIRPORT.strokeScreenWidth, zoom)

    this.gfx.clear()
    this.gfx.fillStyle(AIRPORT.color, 1)
    this.gfx.lineStyle(strokeWidth, AIRPORT.color, 1)

    const labelled = this.visibleLabelIndices(zoom)

    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i]

      // Glyph size encodes airport size: majors/airbases large, minor fields
      // small. Equilateral triangle (circumradius r) pointing up, centred on it.
      const r = screenPxToWorld(AIRPORT.markerScreenRadius[m.tier], zoom)
      const halfWidth = r * TRIANGLE_HALF_WIDTH_RATIO
      const halfHeight = r / 2

      // Every field's triangle is always drawn (military filled, civil hollow).
      const [ax, ay] = [m.x, m.y - r] // top vertex
      const [bx, by] = [m.x - halfWidth, m.y + halfHeight] // bottom-left
      const [cx, cy] = [m.x + halfWidth, m.y + halfHeight] // bottom-right
      if (m.tier === 'military') {
        this.gfx.fillTriangle(ax, ay, bx, by, cx, cy)
      } else {
        this.gfx.strokeTriangle(ax, ay, bx, by, cx, cy)
      }

      // Names are gated by the reveal + de-dup computed above. Offset clears this
      // field's own (tier-sized) triangle so the label always sits just above it.
      const label = this.labels[i]
      const show = labelled.has(i)
      label.setVisible(show)
      if (show) {
        const labelOffset = screenPxToWorld(
          AIRPORT.markerScreenRadius[m.tier] + AIRPORT.labelScreenGap,
          zoom,
        )
        label.setScale(1 / zoom).setPosition(m.x, m.y - labelOffset)
      }
    }
  }
}
