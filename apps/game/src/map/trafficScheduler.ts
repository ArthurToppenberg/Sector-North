import { SIM_TICK_SEC, type AircraftSim, type TickSpawner } from './aircraft'
import { AIRCRAFT_TYPES } from './aircraftTypes'
import type { Airport } from './airports'
import { RouteBrain, type Waypoint } from './brain'
import { bearingDeg, offsetKm } from './geo'
import type { Rng } from './rng'
import type { FlowPattern, LocalPattern, RouteAnchor, TrafficPattern } from './trafficPatterns'
import { makeFail, requirePositiveNumber, type Fail } from './validate'

const fail: Fail = makeFail('map/trafficScheduler')

/** Arbitrary but fixed: the same seed flies the same sky every session. */
export const TRAFFIC_SEED = 0x5eeded

/**
 * One warm-up hour of whole ticks covers the longest transit (~49 min coast
 * to coast), so the sky opens at steady state instead of empty.
 */
export const TRAFFIC_WARMUP_SEC = 3600

/**
 * Safety valve well above the ~30 aircraft the phase-1 rates settle at —
 * headroom for /spawn-planes and rate multipliers, not a number the ambient
 * traffic should ever reach on its own.
 */
export const MAX_TRAFFIC_AIRCRAFT = 60

function referencedAirportNames(p: TrafficPattern): string[] {
  if (p.kind === 'local') return [p.airportName]
  return p.route.flatMap((a) => (a.kind === 'airport' ? [a.name] : []))
}

/**
 * Spawns the ambient public traffic. Ticked by `AircraftSim.advance` at the
 * top of every whole tick (it implements the sim's `TickSpawner` seam), so
 * spawning is tick-quantized and the whole traffic picture replays
 * bit-identically from the seed. Each pattern is an independent Poisson
 * stream: inter-arrival times are drawn exponentially from the seeded PRNG
 * and counted down in canonical ticks.
 */
export class TrafficScheduler implements TickSpawner {
  private readonly fields = new Map<string, Waypoint>()
  /** Seconds until each pattern's next spawn, index-aligned with `patterns`. */
  private readonly nextSpawnSec: number[]
  private enabled = true
  private rateMultiplier = 1
  private spawnedTotal = 0
  private skippedAtCap = 0

  constructor(
    private readonly patterns: readonly TrafficPattern[],
    airports: readonly Airport[],
    private readonly rng: Rng,
    private readonly maxAircraft: number = MAX_TRAFFIC_AIRCRAFT,
  ) {
    if (patterns.length === 0) fail('needs at least one traffic pattern')
    if (!Number.isInteger(maxAircraft) || maxAircraft < 1) {
      fail(`maxAircraft must be a positive integer, got ${JSON.stringify(maxAircraft)}`)
    }
    for (const a of airports) this.fields.set(a.name, { lon: a.lon, lat: a.lat })
    // Resolve every airport reference now, not on the first spawn minutes
    // into a session.
    for (const p of patterns) {
      for (const name of referencedAirportNames(p)) {
        if (!this.fields.has(name)) {
          fail(`pattern ${p.name} references unknown airport ${JSON.stringify(name)}`)
        }
      }
    }
    this.nextSpawnSec = patterns.map((p) => this.drawIntervalSec(p))
  }

  tick(sim: AircraftSim): void {
    if (!this.enabled) return
    for (let i = 0; i < this.patterns.length; i++) {
      this.nextSpawnSec[i] -= SIM_TICK_SEC
      while (this.nextSpawnSec[i] <= 0) {
        // Add rather than reset: an interval shorter than the overshoot keeps
        // its place in the Poisson stream instead of being stretched.
        this.nextSpawnSec[i] += this.drawIntervalSec(this.patterns[i])
        if (sim.count >= this.maxAircraft) {
          this.skippedAtCap++
          continue
        }
        this.spawnFlight(sim, this.patterns[i])
      }
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on
  }

  get isEnabled(): boolean {
    return this.enabled
  }

  /** Scales every pattern's rate (1 = the calibrated real-world rates). */
  setRateMultiplier(multiplier: number): void {
    requirePositiveNumber(multiplier, fail, 'rate multiplier')
    // Rescale the pending countdowns too: exponential intervals are memoryless,
    // so scaling the remainder is statistically exact — and without it a
    // low-rate pattern whose next draw sits an hour out would ignore the new
    // rate until then.
    const factor = this.rateMultiplier / multiplier
    for (let i = 0; i < this.nextSpawnSec.length; i++) this.nextSpawnSec[i] *= factor
    this.rateMultiplier = multiplier
  }

  get stats(): { readonly spawned: number; readonly skippedAtCap: number } {
    return { spawned: this.spawnedTotal, skippedAtCap: this.skippedAtCap }
  }

  private drawIntervalSec(p: TrafficPattern): number {
    return this.rng.exponential(3600 / (p.ratePerHour * this.rateMultiplier))
  }

  private spawnFlight(sim: AircraftSim, p: TrafficPattern): void {
    const points = p.kind === 'flow' ? this.resolveFlowRoute(p) : this.rollLocalCircuit(p)
    const [spawnAt, ...waypoints] = points
    sim.spawn(
      {
        lon: spawnAt.lon,
        lat: spawnAt.lat,
        // Down the first leg from the start, so every flight enters clean
        // instead of opening with a swerve (the /spawn-intruder convention).
        headingDeg: bearingDeg(spawnAt.lon, spawnAt.lat, waypoints[0].lon, waypoints[0].lat),
        type: p.type,
      },
      new RouteBrain(waypoints, AIRCRAFT_TYPES[p.type].turnRateDegPerSec),
    )
    this.spawnedTotal++
  }

  private resolveFlowRoute(p: FlowPattern): Waypoint[] {
    return p.route.map((anchor) => this.resolveAnchor(p, anchor))
  }

  private resolveAnchor(p: FlowPattern, anchor: RouteAnchor): Waypoint {
    switch (anchor.kind) {
      case 'point':
        return { lon: anchor.lon, lat: anchor.lat }
      case 'gate': {
        const t = this.rng.next()
        return {
          lon: anchor.gate.a.lon + (anchor.gate.b.lon - anchor.gate.a.lon) * t,
          lat: anchor.gate.a.lat + (anchor.gate.b.lat - anchor.gate.a.lat) * t,
        }
      }
      case 'airport':
        return this.field(p.name, anchor.name)
    }
  }

  private rollLocalCircuit(p: LocalPattern): Waypoint[] {
    const home = this.field(p.name, p.airportName)
    const legs = this.rng.int(p.legCount.min, p.legCount.max)
    const points: Waypoint[] = [home]
    for (let i = 0; i < legs; i++) {
      const [lon, lat] = offsetKm(home.lon, home.lat, this.rng.range(0, 360), this.rng.range(p.legKm.min, p.legKm.max))
      points.push({ lon, lat })
    }
    points.push(home)
    return points
  }

  private field(patternName: string, airportName: string): Waypoint {
    const found = this.fields.get(airportName)
    if (found === undefined) fail(`pattern ${patternName}: unknown airport ${JSON.stringify(airportName)}`)
    return found
  }
}
