import { describe, it, expect } from 'vitest'
import { turnTowardDeg, RouteBrain, WAYPOINT_CAPTURE_KM, type Waypoint } from './brain'
import { bearingDeg } from './geo'
import { AircraftSim, SIM_TICK_SEC } from './aircraft'
import { AIRCRAFT_TYPES } from './aircraftTypes'
import { KM_PER_DEG_LAT } from './project'

describe('turnTowardDeg', () => {
  it('moves at most maxStepDeg toward the target', () => {
    expect(turnTowardDeg(0, 90, 10)).toBe(10)
    expect(turnTowardDeg(90, 0, 10)).toBe(80)
  })

  it('takes the shortest arc across the 0/360 seam', () => {
    expect(turnTowardDeg(350, 10, 5)).toBe(355)
    expect(turnTowardDeg(10, 350, 5)).toBe(5)
  })

  it('snaps exactly onto the target once within one step', () => {
    expect(turnTowardDeg(89, 90, 10)).toBe(90)
    expect(turnTowardDeg(1, 359, 10)).toBe(359)
  })

  it('normalizes the result into [0, 360)', () => {
    expect(turnTowardDeg(2, 350, 5)).toBe(357)
    expect(turnTowardDeg(358, 10, 5)).toBe(3)
  })

  it('throws on a negative or non-finite maxStepDeg', () => {
    expect(() => turnTowardDeg(0, 90, -1)).toThrow(/maxStepDeg must be finite/)
    expect(() => turnTowardDeg(0, 90, Number.NaN)).toThrow(/maxStepDeg must be finite/)
  })
})

describe('RouteBrain', () => {
  const turnRate = AIRCRAFT_TYPES.il20m.turnRateDegPerSec

  function flyRoute(waypoints: Waypoint[], spawnLon: number, spawnLat: number, hours: number) {
    const sim = new AircraftSim()
    const ac = sim.spawn(
      {
        lon: spawnLon,
        lat: spawnLat,
        headingDeg: bearingDeg(spawnLon, spawnLat, waypoints[0].lon, waypoints[0].lat),
        type: 'il20m',
      },
      new RouteBrain(waypoints, turnRate),
    )
    sim.advance(hours * 3600)
    return ac
  }

  it('exposes its route for debug rendering', () => {
    const waypoints: Waypoint[] = [
      { lon: 12, lat: 55 },
      { lon: 13, lat: 55.5 },
    ]
    expect(new RouteBrain(waypoints, turnRate).waypoints).toEqual(waypoints)
  })

  it('rejects an empty waypoint list, bad coordinates, and a non-positive turn rate', () => {
    expect(() => new RouteBrain([], 1)).toThrow(/non-empty waypoint list/)
    expect(() => new RouteBrain([{ lon: 181, lat: 55 }], 1)).toThrow(/out-of-range longitude/)
    expect(() => new RouteBrain([{ lon: 12, lat: 91 }], 1)).toThrow(/out-of-range latitude/)
    expect(() => new RouteBrain([{ lon: 12, lat: 55 }], 0)).toThrow(/non-positive/)
  })

  it('passes within the capture radius of every waypoint, in order', () => {
    // A dogleg: north first, then a hard turn east.
    const waypoints: Waypoint[] = [
      { lon: 12, lat: 55.5 },
      { lon: 13, lat: 55.5 },
    ]
    const sim = new AircraftSim()
    const ac = sim.spawn(
      { lon: 12, lat: 55, headingDeg: 0, type: 'il20m' },
      new RouteBrain(waypoints, turnRate),
    )
    const closestKm = waypoints.map(() => Number.POSITIVE_INFINITY)
    const closestAtTick = waypoints.map(() => 0)
    const ticks = 3600 / SIM_TICK_SEC
    for (let tick = 1; tick <= ticks; tick++) {
      sim.advance(SIM_TICK_SEC)
      waypoints.forEach((wp, i) => {
        const eastKm = (wp.lon - ac.lon) * KM_PER_DEG_LAT * Math.cos((ac.lat * Math.PI) / 180)
        const northKm = (wp.lat - ac.lat) * KM_PER_DEG_LAT
        const d = Math.hypot(eastKm, northKm)
        if (d < closestKm[i]) {
          closestKm[i] = d
          closestAtTick[i] = tick
        }
      })
    }
    for (const d of closestKm) expect(d).toBeLessThanOrEqual(WAYPOINT_CAPTURE_KM)
    expect(closestAtTick[0]).toBeLessThan(closestAtTick[1])
    expect(ac.lon).toBeGreaterThan(13)
  })

  it('holds its final heading after the last waypoint instead of circling back', () => {
    const waypoints: Waypoint[] = [{ lon: 12, lat: 55.2 }]
    const ac = flyRoute(waypoints, 12, 55, 1)
    expect(ac.headingDeg).toBe(0)
    // Well past the waypoint plus its capture radius: it kept flying north.
    expect(ac.lat).toBeGreaterThan(55.2 + WAYPOINT_CAPTURE_KM / KM_PER_DEG_LAT)
  })

  it('turns no faster than the profile turn rate per tick', () => {
    const sim = new AircraftSim()
    // Target due west of the spawn point, aircraft pointing north: a 90° turn.
    const ac = sim.spawn(
      { lon: 12, lat: 55, headingDeg: 0, type: 'il20m' },
      new RouteBrain([{ lon: 11, lat: 55 }], turnRate),
    )
    sim.advance(SIM_TICK_SEC)
    const turned = Math.min(ac.headingDeg, 360 - ac.headingDeg)
    expect(turned).toBeCloseTo(turnRate * SIM_TICK_SEC, 10)
  })

  it('is bit-deterministic: one fast-forward equals many irregular slices', () => {
    const waypoints: Waypoint[] = [
      { lon: 12.5, lat: 55.3 },
      { lon: 13.1, lat: 55 },
    ]
    const run = (deltas: number[]) => {
      const sim = new AircraftSim()
      const ac = sim.spawn(
        { lon: 12, lat: 55, headingDeg: 45, type: 'il20m' },
        new RouteBrain(waypoints, turnRate),
      )
      for (const d of deltas) sim.advance(d)
      return [ac.lon, ac.lat, ac.headingDeg]
    }
    // Dyadic slices sum to exactly 2400 in binary floating point, so both
    // runs consume the identical whole-tick count.
    const sliced = [1200, 0.5, 0.25, 0.125, 599.125, 600]
    expect(sliced.reduce((a, b) => a + b, 0)).toBe(2400)
    expect(run([2400])).toEqual(run(sliced))
  })
})
