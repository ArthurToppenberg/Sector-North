import Phaser from 'phaser'
import { RADAR, DEPTH } from './config'
import { screenPxToWorld } from './units'
import { log } from '../log/logger'

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
    // Stagger the starting angles so the sites don't sweep in visual lockstep.
    this.angle = markers.map((_, i) => (i / markers.length) * TAU)
    this.gfx = scene.add.graphics().setDepth(DEPTH.radarSweep)

    log.debug(`RadarSweepLayer: ${this.markers.length} sweep sites`)
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
   */
  update(deltaSec: number, zoom: number): void {
    if (!this.layerVisible) return
    if (!Number.isFinite(deltaSec) || deltaSec < 0) {
      fail(`deltaSec must be finite and >= 0, got ${deltaSec}`)
    }

    const lineWidth = screenPxToWorld(RADAR.sweep.lineScreenWidth, zoom)
    const ringWidth = screenPxToWorld(RADAR.sweep.ringScreenWidth, zoom)

    this.gfx.clear()

    // Faint range rings first, so the brighter sweep hands draw over them.
    this.gfx.lineStyle(ringWidth, RADAR.sweep.color, RADAR.sweep.ringAlpha)
    for (let i = 0; i < this.markers.length; i++) {
      this.gfx.strokeCircle(this.markers[i].x, this.markers[i].y, this.rangePx[i])
    }

    this.gfx.lineStyle(lineWidth, RADAR.sweep.color, RADAR.sweep.lineAlpha)
    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i]
      // Screen Y grows downward, so an increasing angle sweeps clockwise — the
      // radar convention. Wrap to keep the accumulated value bounded.
      this.angle[i] = (this.angle[i] + (TAU * deltaSec) / m.updateIntervalSec) % TAU
      const a = this.angle[i]
      const r = this.rangePx[i]
      this.gfx.lineBetween(m.x, m.y, m.x + Math.cos(a) * r, m.y + Math.sin(a) * r)
    }
  }
}
