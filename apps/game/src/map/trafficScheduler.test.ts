import { describe, it, expect } from 'vitest'
import { AircraftSim } from './aircraft'
import { loadAirports, type Airport } from './airports'
import { distanceKm } from './geo'
import { RadarField } from './radarField'
import { Rng } from './rng'
import { TRAFFIC_PATTERNS, type FlowPattern, type Gate, type LocalPattern, type RouteAnchor } from './trafficPatterns'
import {
  TrafficScheduler,
  MAX_TRAFFIC_AIRCRAFT,
  TRAFFIC_SEED,
  TRAFFIC_WARMUP_SEC,
} from './trafficScheduler'
import realAirports from '../data/airports.json'

const AIRPORTS: Airport[] = [
  { name: 'Alpha Field', lon: 12.6, lat: 55.6, tier: 'major' },
  { name: 'Bravo Field', lon: 9.2, lat: 56.3, tier: 'minor' },
]

function point(lon: number, lat: number): RouteAnchor {
  return { kind: 'point', lon, lat }
}

function gate(g: Gate): RouteAnchor {
  return { kind: 'gate', gate: g }
}

function airport(name: string): RouteAnchor {
  return { kind: 'airport', name }
}

function flow(name: string, ratePerHour: number, route: RouteAnchor[]): FlowPattern {
  return { kind: 'flow', name, type: 'airliner', ratePerHour, route }
}

/**
 * Drives the spawner seam directly (never advancing the sim), so spawned
 * aircraft sit exactly where the scheduler placed them — no position step has
 * smeared the spawn point.
 */
function tickUntilSpawned(scheduler: TrafficScheduler, sim: AircraftSim, wanted: number): void {
  for (let ticks = 0; scheduler.stats.spawned < wanted; ticks++) {
    if (ticks > 100_000) throw new Error(`no ${wanted} spawns within 100k ticks`)
    scheduler.tick(sim)
  }
}

describe('TrafficScheduler', () => {
  it('is bit-deterministic: one fast-forward equals many irregular slices', () => {
    const run = (deltas: number[]) => {
      const patterns = [
        flow('trunk-east', 24, [gate({ a: { lon: 8, lat: 54.5 }, b: { lon: 8, lat: 57 } }), point(16, 56)]),
        {
          kind: 'local',
          name: 'ga-alpha',
          type: 'gaPiston',
          ratePerHour: 12,
          airportName: 'Alpha Field',
          legKm: { min: 10, max: 30 },
          legCount: { min: 2, max: 4 },
        } satisfies LocalPattern,
      ]
      const scheduler = new TrafficScheduler(patterns, AIRPORTS, new Rng(42))
      const sim = new AircraftSim(undefined, scheduler)
      for (const d of deltas) sim.advance(d)
      return {
        aircraft: sim.all.map((a) => ({ id: a.id, lon: a.lon, lat: a.lat, headingDeg: a.headingDeg })),
        stats: scheduler.stats,
      }
    }
    // Dyadic slices sum to exactly 2400 in binary floating point, so both
    // runs consume the identical whole-tick count.
    const sliced = [1200, 0.5, 0.25, 0.125, 599.125, 600]
    expect(sliced.reduce((a, b) => a + b, 0)).toBe(2400)
    const fastForward = run([2400])
    expect(fastForward.aircraft.length).toBeGreaterThan(0)
    expect(fastForward).toEqual(run(sliced))
  })

  it('spawns at roughly the configured Poisson rate', () => {
    const scheduler = new TrafficScheduler(
      [flow('shuttle', 60, [point(12, 55), point(12, 55.5)])],
      AIRPORTS,
      new Rng(7),
    )
    const sim = new AircraftSim(undefined, scheduler)
    sim.advance(2 * 3600)
    expect(scheduler.stats.spawned).toBeGreaterThanOrEqual(80)
    expect(scheduler.stats.spawned).toBeLessThanOrEqual(160)
  })

  it('culls a flight at its route end while stats still count it', () => {
    // ~22 km leg at airliner cruise is well under the 300 s flown below.
    const scheduler = new TrafficScheduler(
      [flow('short-hop', 720, [point(12, 55), point(12, 55.2)])],
      AIRPORTS,
      new Rng(3),
    )
    const sim = new AircraftSim(undefined, scheduler)
    sim.advance(30)
    expect(scheduler.stats.spawned).toBeGreaterThan(0)
    expect(sim.count).toBeGreaterThan(0)
    scheduler.setEnabled(false)
    const spawned = scheduler.stats.spawned
    sim.advance(300)
    expect(sim.count).toBe(0)
    expect(scheduler.stats.spawned).toBe(spawned)
  })

  it('jitters a gate spawn along the gate segment', () => {
    const a = { lon: 12, lat: 55 }
    const b = { lon: 12.5, lat: 55.8 }
    const scheduler = new TrafficScheduler(
      [flow('inbound', 3600, [gate({ a, b }), point(15, 55.4)])],
      AIRPORTS,
      new Rng(11),
    )
    const sim = new AircraftSim(undefined, scheduler)
    tickUntilSpawned(scheduler, sim, 8)
    for (const ac of sim.all) {
      const tLon = (ac.lon - a.lon) / (b.lon - a.lon)
      const tLat = (ac.lat - a.lat) / (b.lat - a.lat)
      expect(tLon).toBeGreaterThanOrEqual(0)
      expect(tLon).toBeLessThanOrEqual(1)
      expect(tLat).toBeCloseTo(tLon, 10)
    }
    expect(new Set(sim.all.map((ac) => ac.lon)).size).toBeGreaterThan(1)
  })

  it('resolves an airport anchor to the field itself as the final waypoint', () => {
    const scheduler = new TrafficScheduler(
      [flow('arrival', 3600, [point(10, 55), airport('Alpha Field')])],
      AIRPORTS,
      new Rng(5),
    )
    const sim = new AircraftSim(undefined, scheduler)
    tickUntilSpawned(scheduler, sim, 1)
    const brain = sim.brainOf(sim.all[0].id)
    expect(brain?.waypoints?.at(-1)).toEqual({ lon: 12.6, lat: 55.6 })
  })

  it('rolls local circuits that start and end at the field with legCount in bounds', () => {
    const pattern: LocalPattern = {
      kind: 'local',
      name: 'ga-alpha',
      type: 'gaPiston',
      ratePerHour: 3600,
      airportName: 'Alpha Field',
      legKm: { min: 10, max: 30 },
      legCount: { min: 2, max: 4 },
    }
    const scheduler = new TrafficScheduler([pattern], AIRPORTS, new Rng(13))
    const sim = new AircraftSim(undefined, scheduler)
    tickUntilSpawned(scheduler, sim, 6)
    const home = AIRPORTS[0]
    for (const ac of sim.all) {
      expect(ac.lon).toBe(home.lon)
      expect(ac.lat).toBe(home.lat)
      const waypoints = sim.brainOf(ac.id)?.waypoints
      if (waypoints === undefined) throw new Error(`aircraft ${ac.id} has no route brain`)
      expect(waypoints.at(-1)).toEqual({ lon: home.lon, lat: home.lat })
      const legs = waypoints.length - 1
      expect(legs).toBeGreaterThanOrEqual(2)
      expect(legs).toBeLessThanOrEqual(4)
      for (const wp of waypoints.slice(0, -1)) {
        const d = distanceKm(home.lon, home.lat, wp.lon, wp.lat)
        expect(d).toBeGreaterThanOrEqual(10)
        expect(d).toBeLessThanOrEqual(30)
      }
    }
  })

  it('never exceeds maxAircraft and counts the skipped spawns', () => {
    // ~700 km route: no flight can complete within the 600 s flown below.
    const scheduler = new TrafficScheduler(
      [flow('long-haul', 360, [point(6, 57.5), point(16, 54.5)])],
      AIRPORTS,
      new Rng(21),
      1,
    )
    const sim = new AircraftSim(undefined, scheduler)
    for (let s = 0; s < 600; s++) {
      sim.advance(1)
      expect(sim.count).toBeLessThanOrEqual(1)
    }
    expect(sim.count).toBe(1)
    expect(scheduler.stats.skippedAtCap).toBeGreaterThan(0)
  })

  it('spawns nothing while disabled and resumes when re-enabled', () => {
    const scheduler = new TrafficScheduler(
      [flow('shuttle', 720, [point(12, 55), point(12, 56)])],
      AIRPORTS,
      new Rng(9),
    )
    const sim = new AircraftSim(undefined, scheduler)
    scheduler.setEnabled(false)
    sim.advance(120)
    expect(scheduler.stats.spawned).toBe(0)
    expect(sim.count).toBe(0)
    scheduler.setEnabled(true)
    sim.advance(120)
    expect(scheduler.stats.spawned).toBeGreaterThan(0)
  })

  it('scales spawn counts by the rate multiplier, including intervals already drawn', () => {
    // A short hop so flights land quickly and the cap never suppresses spawns.
    const run = (multiplier: number) => {
      const scheduler = new TrafficScheduler(
        [flow('shuttle', 30, [point(12, 55), point(12, 55.2)])],
        AIRPORTS,
        new Rng(17),
      )
      // Applied AFTER construction, so the intervals drawn at construction
      // must be rescaled too for the ratio below to hold.
      if (multiplier !== 1) scheduler.setRateMultiplier(multiplier)
      const sim = new AircraftSim(undefined, scheduler)
      sim.advance(2 * 3600)
      expect(scheduler.stats.skippedAtCap).toBe(0)
      return scheduler.stats.spawned
    }
    const base = run(1)
    const quadrupled = run(4)
    expect(base).toBeGreaterThan(0)
    expect(quadrupled).toBeGreaterThan(base * 2.5)
    expect(quadrupled).toBeLessThan(base * 6)
  })

  it('rejects a non-positive rate multiplier', () => {
    const scheduler = new TrafficScheduler(
      [flow('shuttle', 1, [point(12, 55), point(12, 56)])],
      AIRPORTS,
      new Rng(1),
    )
    expect(() => scheduler.setRateMultiplier(0)).toThrow(/non-positive/)
    expect(() => scheduler.setRateMultiplier(-2)).toThrow(/non-positive/)
  })

  it('rejects an unknown airport reference at construction', () => {
    expect(
      () => new TrafficScheduler([flow('ghost', 1, [airport('Nowhere Field'), point(12, 55)])], AIRPORTS, new Rng(1)),
    ).toThrow(/unknown airport/)
  })

  it('rejects an empty pattern list', () => {
    expect(() => new TrafficScheduler([], AIRPORTS, new Rng(1))).toThrow(/at least one/)
  })
})

describe('production wiring (TRAFFIC_PATTERNS + real airports + radar)', () => {
  it('warms up to a deterministic steady state under the aircraft cap', () => {
    const run = () => {
      const field = new RadarField([
        { name: 'Centre', lon: 10.5, lat: 55.7, rangeKm: 300, updateIntervalSec: 10 },
      ])
      const scheduler = new TrafficScheduler(TRAFFIC_PATTERNS, loadAirports(realAirports), new Rng(TRAFFIC_SEED))
      const sim = new AircraftSim(field, scheduler)
      sim.advance(TRAFFIC_WARMUP_SEC)
      return {
        count: sim.count,
        stats: scheduler.stats,
        contacts: field.contacts.length,
        aircraft: sim.all.map((a) => [a.lon, a.lat, a.headingDeg]),
      }
    }
    const warm = run()
    // The calibration claim: real rates settle around ~30 concurrent aircraft,
    // well under the cap — the cap must never engage on ambient traffic alone.
    expect(warm.count).toBeGreaterThanOrEqual(15)
    expect(warm.count).toBeLessThan(MAX_TRAFFIC_AIRCRAFT)
    expect(warm.stats.skippedAtCap).toBe(0)
    expect(warm.stats.spawned).toBeGreaterThan(30)
    expect(warm.contacts).toBeGreaterThan(0)
    expect(run()).toEqual(warm)
  })
})
