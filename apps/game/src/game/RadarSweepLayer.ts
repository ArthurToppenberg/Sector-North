import Phaser from 'phaser'
import { RADAR, DEPTH } from './config'
import { screenPxToWorld } from './units'

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

function fail(message: string): never {
  throw new Error(`[game/RadarSweepLayer] ${message}`)
}

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

export class RadarSweepLayer {
  private readonly gfx: Phaser.GameObjects.Graphics
  private readonly markers: readonly RadarSweepMarker[]
  /** Range radius per site in world pixels (rangeKm × pixelsPerKm), precomputed. */
  private readonly rangePx: number[]
  /** Current sweep angle per site (radians), advanced by real elapsed time. */
  private readonly angle: number[]
  private layerVisible = true

  constructor(scene: Phaser.Scene, markers: readonly RadarSweepMarker[], pixelsPerKm: number) {
    assertMarkers(markers)
    assertPixelsPerKm(pixelsPerKm)
    this.markers = markers
    this.rangePx = markers.map((m) => m.rangeKm * pixelsPerKm)
    // Stagger the starting angles so whichever site becomes nearest is already at
    // a sensible phase rather than all starting at zero.
    this.angle = markers.map((_, i) => (i / markers.length) * TAU)
    this.gfx = scene.add.graphics().setDepth(DEPTH.radarSweep)
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx]
  }

  setVisible(visible: boolean): void {
    this.layerVisible = visible
    this.gfx.setVisible(visible)
  }

  /**
   * Advance every sweep by `deltaSec` real seconds and redraw. Rotation is one
   * full turn per site's `updateIntervalSec`; `zoom` holds the on-screen stroke
   * width constant. Does nothing while hidden.
   *
   * `(centerX, centerY)` is the camera's world-space view centre, used to pick
   * the nearest site to actually draw (see the clutter-reduction rule in
   * `apps/game/CLAUDE.md`'s rendering-conventions section).
   */
  update(deltaSec: number, zoom: number, centerX: number, centerY: number): void {
    if (!this.layerVisible) return
    if (!Number.isFinite(deltaSec) || deltaSec < 0) {
      fail(`deltaSec must be finite and >= 0, got ${deltaSec}`)
    }
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
      fail(`camera centre must be finite, got (${centerX}, ${centerY})`)
    }

    for (let i = 0; i < this.markers.length; i++) {
      // Screen Y grows downward, so an increasing angle sweeps clockwise — the
      // radar convention. Wrap to keep the accumulated value bounded.
      this.angle[i] = (this.angle[i] + (TAU * deltaSec) / this.markers[i].updateIntervalSec) % TAU
    }

    const nearest = this.nearestMarkerIndex(centerX, centerY)
    const m = this.markers[nearest]
    const r = this.rangePx[nearest]

    const lineWidth = screenPxToWorld(RADAR.sweep.lineScreenWidth, zoom)
    const ringWidth = screenPxToWorld(RADAR.sweep.ringScreenWidth, zoom)

    this.gfx.clear()

    // Faint range ring first, so the brighter sweep hand draws over it.
    this.gfx.lineStyle(ringWidth, RADAR.sweep.color, RADAR.sweep.ringAlpha)
    this.gfx.strokeCircle(m.x, m.y, r)

    this.gfx.lineStyle(lineWidth, RADAR.sweep.color, RADAR.sweep.lineAlpha)
    const a = this.angle[nearest]
    this.gfx.lineBetween(m.x, m.y, m.x + Math.cos(a) * r, m.y + Math.sin(a) * r)
  }

  private nearestMarkerIndex(centerX: number, centerY: number): number {
    let best = 0
    let bestDistSq = Infinity
    for (let i = 0; i < this.markers.length; i++) {
      const dx = this.markers[i].x - centerX
      const dy = this.markers[i].y - centerY
      const distSq = dx * dx + dy * dy
      if (distSq < bestDistSq) {
        bestDistSq = distSq
        best = i
      }
    }
    return best
  }
}
