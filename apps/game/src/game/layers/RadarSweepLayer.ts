import Phaser from 'phaser'
import { makeFail, type Fail } from '../fail'
import { RADAR, DEPTH } from '../config'
import { screenPxToWorld } from '../units'
import { DEG2RAD } from '../../map/aircraft'
import type { RadarField } from '../../map/radarField'
import type { WorldLayer, ToggleableLayer } from './helpers'

export interface RadarSweepMarker {
  name: string
  x: number
  y: number
  /**
   * Semi-axes (world pixels) of the site's projected detection boundary. The
   * RadarField judges range in real km lat-corrected at the site's latitude,
   * while the projection compresses longitude at the frame's mean latitude, so
   * the boundary is an ellipse on screen — `buildRadarSweepMarkers` projects it
   * exactly, keeping the drawn coverage edge coincident with the sensing edge.
   */
  rangeXPx: number
  rangeYPx: number
}

const fail: Fail = makeFail('game/RadarSweepLayer')

/**
 * Validate at the layer boundary (GPS is the source of truth): a non-finite
 * projected position means projection failed, and a non-positive range axis is
 * a data/wiring bug (e.g. a projector that doesn't flip Y) — refuse to draw
 * garbage.
 */
function assertMarkers(markers: readonly RadarSweepMarker[]): void {
  if (markers.length === 0) fail('expected at least one radar sweep marker')
  markers.forEach((m, i) => {
    if (typeof m.name !== 'string' || m.name.length === 0) fail(`marker ${i} has no name`)
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) {
      fail(`marker ${m.name} has a non-finite projected position (${m.x}, ${m.y})`)
    }
    if (!Number.isFinite(m.rangeXPx) || m.rangeXPx <= 0 || !Number.isFinite(m.rangeYPx) || m.rangeYPx <= 0) {
      fail(`marker ${m.name} has non-positive range semi-axes (${m.rangeXPx}, ${m.rangeYPx})`)
    }
  })
}

/**
 * Pure presenter of the radar sensor field: the antennas themselves — sweep
 * bearings, detection, the contact picture — are world state in
 * `src/map/radarField.ts`, ticked inside the sim's fixed-tick loop. This layer
 * only draws one site's range ring and sweep hand from that state each frame.
 */
export class RadarSweepLayer implements WorldLayer, ToggleableLayer {
  private readonly gfx: Phaser.GameObjects.Graphics
  private readonly markers: readonly RadarSweepMarker[]
  private layerVisible = true

  constructor(scene: Phaser.Scene, markers: readonly RadarSweepMarker[]) {
    assertMarkers(markers)
    this.markers = markers
    this.gfx = scene.add.graphics().setDepth(DEPTH.radarSweep)
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx]
  }

  /**
   * Presentation only: hides the drawn overlay (range ring + sweep hand). The
   * antennas live in the world model (`RadarField`) and keep rotating and
   * detecting regardless — a hidden sweep is an invisible radar, not a
   * switched-off one.
   */
  setVisible(visible: boolean): void {
    this.layerVisible = visible
    this.gfx.setVisible(visible)
  }

  /**
   * Redraw the single drawn site's coverage from the field's current state.
   * `tickFraction` is the sim's banked sub-tick time in [0, 1): the hand is
   * extrapolated by that fraction of the site's per-tick step so it moves
   * smoothly between ticks — display-side only, world state never reads it.
   *
   * `(centerX, centerY)` is the camera's world-space view centre, used to pick
   * the single site to actually draw — the one whose coverage the centre is under
   * (see `selectSweepIndex` and the clutter-reduction rule in `apps/game/CLAUDE.md`'s
   * rendering-conventions section). `zoom` holds the on-screen stroke width constant.
   */
  draw(field: RadarField, tickFraction: number, zoom: number, centerX: number, centerY: number): void {
    // Index alignment is the invariant that lets marker i present field site i:
    // both must be built from the same radars array in the same order
    // (buildRadarSweepMarkers / buildRadarSites).
    if (field.siteCount !== this.markers.length) {
      fail(`field has ${field.siteCount} sites but the layer has ${this.markers.length} markers`)
    }
    if (!Number.isFinite(tickFraction) || tickFraction < 0 || tickFraction >= 1) {
      fail(`tickFraction must be in [0, 1), got ${tickFraction}`)
    }
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
      fail(`camera centre must be finite, got (${centerX}, ${centerY})`)
    }

    if (!this.layerVisible) return

    const selected = this.selectSweepIndex(centerX, centerY)
    const m = this.markers[selected]

    const lineWidth = screenPxToWorld(RADAR.sweep.lineScreenWidth, zoom)
    const ringWidth = screenPxToWorld(RADAR.sweep.ringScreenWidth, zoom)

    this.gfx.clear()

    // Faint range ring first, so the brighter sweep hand draws over it. The ring
    // is the ellipse the real-km detection boundary projects to (see the marker's
    // semi-axes doc); strokeEllipse takes full width/height, not radii.
    this.gfx.lineStyle(ringWidth, RADAR.sweep.color, RADAR.sweep.ringAlpha)
    this.gfx.strokeEllipse(m.x, m.y, m.rangeXPx * 2, m.rangeYPx * 2)

    const bearing = field.bearingOf(selected) + tickFraction * field.perTickStepDeg(selected)
    // Compass → screen: sin/cos of the bearing give the east/north components
    // (0° = north, clockwise); east scales by the x semi-axis and north by the y
    // semi-axis (negated — screen Y grows down). Because the projection is linear,
    // the detection ray at this bearing maps to exactly this segment, so the hand
    // crosses a blip precisely when the field's sweep passes the plane's compass
    // bearing, and the hand tip rides the drawn ring.
    const a = bearing * DEG2RAD
    this.gfx.lineStyle(lineWidth, RADAR.sweep.color, RADAR.sweep.lineAlpha)
    this.gfx.lineBetween(m.x, m.y, m.x + Math.sin(a) * m.rangeXPx, m.y - Math.cos(a) * m.rangeYPx)
  }

  private selectSweepIndex(centerX: number, centerY: number): number {
    let best = 0
    let bestDistSq = Infinity
    let bestContains = false
    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i]
      const dx = m.x - centerX
      const dy = m.y - centerY
      const distSq = dx * dx + dy * dy
      // Containment tests the drawn ellipse (axis-normalized ≤ 1), so the drawn
      // ring and the "you are inside this coverage" pick can never disagree. A
      // site whose ring contains the centre outranks one that doesn't; within the
      // same containment tier the nearer wins. (Centre inside no ring → all
      // false → nearest overall.)
      const nx = dx / m.rangeXPx
      const ny = dy / m.rangeYPx
      const contains = nx * nx + ny * ny <= 1
      const better = contains === bestContains ? distSq < bestDistSq : contains
      if (better) {
        best = i
        bestDistSq = distSq
        bestContains = contains
      }
    }
    return best
  }
}
