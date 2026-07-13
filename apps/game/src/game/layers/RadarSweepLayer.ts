import Phaser from 'phaser'
import { makeFail, type Fail } from '../fail'
import { RADAR, DEPTH } from '../config'
import { screenPxToWorld } from '../units'
import type { WorldLayer, ToggleableLayer } from './helpers'

export interface RadarSweepMarker {
  name: string
  x: number
  y: number
  /** Detection range in real kilometres — the sweep hand's length on the ground. */
  rangeKm: number
  /** Antenna revolution period in seconds — one full sweep rotation. */
  updateIntervalSec: number
}

const TAU = Math.PI * 2

/** Wrap an angle (radians) into `[0, TAU)`. */
function norm(angle: number): number {
  return ((angle % TAU) + TAU) % TAU
}

const fail: Fail = makeFail('game/RadarSweepLayer')

/**
 * Pixels-per-km must be finite and positive: every range radius is derived from
 * it, so a zero/NaN value would collapse or poison the whole layer's geometry.
 */
function assertPixelsPerKm(pixelsPerKm: number): void {
  if (!Number.isFinite(pixelsPerKm) || pixelsPerKm <= 0) {
    fail(`pixelsPerKm must be finite and > 0, got ${pixelsPerKm}`)
  }
}

/**
 * Validate at the layer boundary (GPS is the source of truth): a non-finite
 * projected position means projection failed, and a non-positive range or
 * revolution time is a data/wiring bug — refuse to animate garbage.
 */
function assertMarkers(markers: readonly RadarSweepMarker[]): void {
  if (markers.length === 0) fail('expected at least one radar sweep marker')
  markers.forEach((m, i) => {
    if (typeof m.name !== 'string' || m.name.length === 0) fail(`marker ${i} has no name`)
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) {
      fail(`marker ${m.name} has a non-finite projected position (${m.x}, ${m.y})`)
    }
    if (!Number.isFinite(m.rangeKm) || m.rangeKm <= 0) {
      fail(`marker ${m.name} has a non-positive rangeKm: ${m.rangeKm}`)
    }
    if (!Number.isFinite(m.updateIntervalSec) || m.updateIntervalSec <= 0) {
      fail(`marker ${m.name} has a non-positive updateIntervalSec: ${m.updateIntervalSec}`)
    }
  })
}

export class RadarSweepLayer implements WorldLayer, ToggleableLayer {
  private readonly gfx: Phaser.GameObjects.Graphics
  private readonly markers: readonly RadarSweepMarker[]
  /** Range radius per site in world pixels (rangeKm × pixelsPerKm), precomputed. */
  private readonly rangePx: number[]
  /** Current sweep angle per site (radians), advanced by real elapsed time. */
  private readonly angle: number[]
  /** Each site's sweep angle at the start of the current frame, before `update`
   * advanced it — the trailing edge of the arc swept this frame, used by
   * `detectSweptTargets` to find contacts the hand crossed. */
  private readonly prevAngle: number[]
  private layerVisible = true

  constructor(scene: Phaser.Scene, markers: readonly RadarSweepMarker[], pixelsPerKm: number) {
    assertMarkers(markers)
    assertPixelsPerKm(pixelsPerKm)
    this.markers = markers
    this.rangePx = markers.map((m) => m.rangeKm * pixelsPerKm)
    this.angle = markers.map((_, i) => (i / markers.length) * TAU)
    this.prevAngle = this.angle.slice()
    this.gfx = scene.add.graphics().setDepth(DEPTH.radarSweep)
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx]
  }

  /**
   * Presentation only: hides the drawn overlay (range ring + sweep hand). The
   * antennas themselves keep rotating and detecting in `update` regardless — a
   * hidden sweep is an invisible radar, not a switched-off one.
   */
  setVisible(visible: boolean): void {
    this.layerVisible = visible
    this.gfx.setVisible(visible)
  }

  /**
   * Advance every sweep by `deltaSec` real seconds and redraw. Rotation is one
   * full turn per site's `updateIntervalSec`; `zoom` holds the on-screen stroke
   * width constant. The angle advance always runs — detection depends on it —
   * while the drawing is skipped when the layer is hidden.
   *
   * `(centerX, centerY)` is the camera's world-space view centre, used to pick
   * the single site to actually draw — the one whose coverage the centre is under
   * (see `selectSweepIndex` and the clutter-reduction rule in `apps/game/CLAUDE.md`'s
   * rendering-conventions section).
   */
  update(deltaSec: number, zoom: number, centerX: number, centerY: number): void {
    if (!Number.isFinite(deltaSec) || deltaSec < 0) {
      fail(`deltaSec must be finite and >= 0, got ${deltaSec}`)
    }
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
      fail(`camera centre must be finite, got (${centerX}, ${centerY})`)
    }

    for (let i = 0; i < this.markers.length; i++) {
      // Screen Y grows downward, so an increasing angle sweeps clockwise — the
      // radar convention. Wrap to keep the accumulated value bounded. Every site
      // advances (not just the drawn one), so detection can run for all radars.
      this.prevAngle[i] = this.angle[i]
      this.angle[i] = (this.angle[i] + (TAU * deltaSec) / this.markers[i].updateIntervalSec) % TAU
    }

    if (!this.layerVisible) return

    const selected = this.selectSweepIndex(centerX, centerY)
    const m = this.markers[selected]
    const r = this.rangePx[selected]

    const lineWidth = screenPxToWorld(RADAR.sweep.lineScreenWidth, zoom)
    const ringWidth = screenPxToWorld(RADAR.sweep.ringScreenWidth, zoom)

    this.gfx.clear()

    // Faint range ring first, so the brighter sweep hand draws over it.
    this.gfx.lineStyle(ringWidth, RADAR.sweep.color, RADAR.sweep.ringAlpha)
    this.gfx.strokeCircle(m.x, m.y, r)

    this.gfx.lineStyle(lineWidth, RADAR.sweep.color, RADAR.sweep.lineAlpha)
    const a = this.angle[selected]
    this.gfx.lineBetween(m.x, m.y, m.x + Math.cos(a) * r, m.y + Math.sin(a) * r)
  }

  /**
   * Is world-pixel point `(x, y)` inside site `i`'s range ring AND the angular
   * slice its hand swept during the most recent `update`? Bearings use the same
   * convention as the drawn hand (`atan2` in world-pixel space, clockwise because
   * screen Y grows down), so this exactly tracks where the visible sweep points.
   *
   * Half-open arc (prevAngle, angle]: the closing edge counts, the opening edge
   * does not, so a bearing on a frame boundary is swept exactly once (this frame's
   * closing edge is next frame's excluded opening edge).
   */
  private sweptBySite(i: number, x: number, y: number): boolean {
    const swept = norm(this.angle[i] - this.prevAngle[i])
    if (swept === 0) return false
    const m = this.markers[i]
    const dx = x - m.x
    const dy = y - m.y
    if (dx * dx + dy * dy > this.rangePx[i] * this.rangePx[i]) return false
    const offset = norm(Math.atan2(dy, dx) - this.prevAngle[i])
    return offset > 0 && offset <= swept
  }

  /**
   * Report which `targets` (world-pixel points) any radar's sweep hand crossed
   * this frame — the contacts to (re)paint. Every site is tested, not just the
   * one drawn (`update` advances all angles), so a target is detected by whichever
   * coverage it is under; a target under two hands at once is still returned once.
   * Runs regardless of the layer's visibility — hiding the sweep overlay is
   * presentation, not switching the radars off.
   *
   * Generic in the target type: only `x`/`y` are read, and the matched targets
   * are returned as-is, so any extra payload (heading, speed) rides through to
   * the caller unchanged.
   */
  detectSweptTargets<T extends { x: number; y: number }>(targets: readonly T[]): T[] {
    const contacts: T[] = []
    for (const t of targets) {
      for (let i = 0; i < this.markers.length; i++) {
        if (this.sweptBySite(i, t.x, t.y)) {
          contacts.push(t)
          break
        }
      }
    }
    return contacts
  }

  /**
   * Whether any site's hand swept over world-pixel point `(x, y)` this frame —
   * used to expire an existing contact the moment the sweep revisits its position
   * (it is then repainted only if a plane is still there). Like detection, runs
   * regardless of the layer's visibility.
   */
  isSwept(x: number, y: number): boolean {
    for (let i = 0; i < this.markers.length; i++) {
      if (this.sweptBySite(i, x, y)) return true
    }
    return false
  }

  private selectSweepIndex(centerX: number, centerY: number): number {
    let best = 0
    let bestDistSq = Infinity
    let bestContains = false
    for (let i = 0; i < this.markers.length; i++) {
      const dx = this.markers[i].x - centerX
      const dy = this.markers[i].y - centerY
      const distSq = dx * dx + dy * dy
      // Squared distance vs squared range radius avoids a sqrt. A site whose ring
      // contains the centre outranks one that doesn't; within the same containment
      // tier the nearer wins. (Centre inside no ring → all false → nearest overall.)
      const contains = distSq <= this.rangePx[i] * this.rangePx[i]
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
