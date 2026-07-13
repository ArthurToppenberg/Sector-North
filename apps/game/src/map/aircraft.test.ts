import { describe, it, expect } from 'vitest'
import { stepAircraft, AircraftSim, SIM_TICK_SEC, type Aircraft, type AircraftSpawn } from './aircraft'
import { AIRCRAFT_TYPES } from './aircraftTypes'
import { KM_PER_DEG_LAT } from './project'

const DEG2RAD = Math.PI / 180

function aircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return { id: 1, type: 'il20m', lon: 12, lat: 55, headingDeg: 0, speedKmh: KM_PER_DEG_LAT, ...overrides }
}

describe('stepAircraft', () => {
  it('moves due north exactly one degree of latitude per KM_PER_DEG_LAT flown', () => {
    const ac = aircraft({ headingDeg: 0 })
    stepAircraft(ac, 3600)
    expect(ac.lat).toBe(56)
    expect(ac.lon).toBe(12)
  })

  it('moves due east with the cos(latitude) longitude correction', () => {
    const ac = aircraft({ headingDeg: 90 })
    stepAircraft(ac, 3600)
    expect(ac.lat).toBeCloseTo(55, 10)
    expect(ac.lon).toBeCloseTo(12 + 1 / Math.cos(55 * DEG2RAD), 10)
  })

  it('moves due south symmetric to north', () => {
    const ac = aircraft({ headingDeg: 180 })
    stepAircraft(ac, 3600)
    expect(ac.lat).toBeCloseTo(54, 10)
    expect(ac.lon).toBeCloseTo(12, 10)
  })

  it('widens the longitude step as latitude climbs (cos correction, ×2 at 60°)', () => {
    const north = aircraft({ lat: 60, headingDeg: 0 })
    const east = aircraft({ lat: 60, headingDeg: 90 })
    stepAircraft(north, 3600)
    stepAircraft(east, 3600)
    const latDelta = north.lat - 60
    const lonDelta = east.lon - 12
    expect(lonDelta).toBeCloseTo(latDelta / Math.cos(60 * DEG2RAD), 10)
    expect(lonDelta).toBeCloseTo(2 * latDelta, 10)
  })

  it('is an exact no-op for zero elapsed time and zero speed', () => {
    const idleTime = aircraft()
    stepAircraft(idleTime, 0)
    expect(idleTime).toEqual(aircraft())

    const idleSpeed = aircraft({ speedKmh: 0 })
    stepAircraft(idleSpeed, 3600)
    expect(idleSpeed).toEqual(aircraft({ speedKmh: 0 }))
  })

  it('throws on a negative or non-finite deltaSec', () => {
    expect(() => stepAircraft(aircraft(), -1)).toThrow(/deltaSec must be finite/)
    expect(() => stepAircraft(aircraft(), Number.NaN)).toThrow(/deltaSec must be finite/)
  })

  it('throws rather than degenerating at a pole', () => {
    expect(() => stepAircraft(aircraft({ lat: 90 }), 1)).toThrow(/too near a pole/)
  })
})

describe('AircraftSim', () => {
  const valid: AircraftSpawn = { lon: 12, lat: 55, headingDeg: 0, type: 'il20m' }

  it('spawns aircraft with sequential ids starting at 1', () => {
    const sim = new AircraftSim()
    const a = sim.spawn(valid)
    const b = sim.spawn({ ...valid, headingDeg: 90 })
    expect(a.id).toBe(1)
    expect(b.id).toBe(2)
    expect(sim.count).toBe(2)
  })

  it('derives the speed from the type profile', () => {
    const sim = new AircraftSim()
    const ac = sim.spawn(valid)
    expect(ac.type).toBe('il20m')
    expect(ac.speedKmh).toBe(AIRCRAFT_TYPES.il20m.cruiseSpeedKmh)
  })

  it('rejects out-of-range, non-finite, or unknown spawn parameters', () => {
    const sim = new AircraftSim()
    expect(() => sim.spawn({ ...valid, lon: 181 })).toThrow(/out-of-range longitude/)
    expect(() => sim.spawn({ ...valid, lat: -91 })).toThrow(/out-of-range latitude/)
    expect(() => sim.spawn({ ...valid, headingDeg: Number.NaN })).toThrow(/headingDeg not finite/)
    expect(() => sim.spawn({ ...valid, type: 'ufo' as never })).toThrow(/type unknown/)
  })

  it('advances every aircraft', () => {
    const sim = new AircraftSim()
    const north = sim.spawn(valid)
    const east = sim.spawn({ ...valid, headingDeg: 90 })
    sim.advance(60)
    expect(north.lat).toBeGreaterThan(55)
    expect(east.lon).toBeGreaterThan(12)
  })

  it('brainOf returns the spawned brain, and undefined for brainless aircraft', () => {
    const sim = new AircraftSim()
    const brain = { tick: () => {} }
    const brained = sim.spawn(valid, brain)
    const brainless = sim.spawn({ ...valid, headingDeg: 90 })
    expect(sim.brainOf(brained.id)).toBe(brain)
    expect(sim.brainOf(brainless.id)).toBeUndefined()
  })

  it('clear removes all aircraft (and their brains) and reports how many', () => {
    const sim = new AircraftSim()
    let ticks = 0
    sim.spawn(valid, { tick: () => ticks++ })
    sim.spawn({ ...valid, headingDeg: 90 })
    expect(sim.clear()).toBe(2)
    expect(sim.count).toBe(0)
    expect(sim.all).toHaveLength(0)

    // A brain must not outlive clear(): later spawns must start brainless.
    sim.spawn(valid)
    sim.advance(1)
    expect(ticks).toBe(0)
  })
})

describe('determinism (fixed-tick stepping)', () => {
  const spawn: AircraftSpawn = { lon: 10.75, lat: 56, headingDeg: 45, type: 'il20m' }
  const cruise = AIRCRAFT_TYPES.il20m.cruiseSpeedKmh

  it('one big step lands elsewhere than the same time in ticks — why the canonical tick exists', () => {
    // Heading 45° so latitude changes: stepAircraft uses the start-lat cosine
    // for the whole step, making integration step-size-sensitive.
    const oneStep = { id: 1, ...spawn, speedKmh: cruise }
    const ticked = { id: 2, ...spawn, speedKmh: cruise }
    stepAircraft(oneStep, 3600)
    for (let i = 0; i < 3600 / SIM_TICK_SEC; i++) stepAircraft(ticked, SIM_TICK_SEC)
    expect(oneStep.lon).not.toBe(ticked.lon)
  })

  it('a fast-forward advance equals the same ticks replayed one by one, bit for bit', () => {
    // SIM_TICK_SEC is exactly representable in binary floating point, so a
    // whole-second duration quantizes into an exact tick count with no remainder.
    const sim = new AircraftSim()
    const plane = sim.spawn(spawn)
    sim.advance(10)

    const reference = { id: 1, ...spawn, speedKmh: cruise }
    for (let i = 0; i < 10 / SIM_TICK_SEC; i++) stepAircraft(reference, SIM_TICK_SEC)

    expect(plane.lon).toBe(reference.lon)
    expect(plane.lat).toBe(reference.lat)
  })

  it('yields bit-identical state for the same sequence of frame deltas', () => {
    const run = () => {
      const sim = new AircraftSim()
      const plane = sim.spawn(spawn)
      for (const delta of [0.016, 0.033, 0.5, 0.007, 2.25, 0.016]) sim.advance(delta)
      return [plane.lon, plane.lat]
    }
    expect(run()).toEqual(run())
  })

  it('banks sub-tick time instead of stepping partially', () => {
    const sim = new AircraftSim()
    const plane = sim.spawn(spawn)
    sim.advance(SIM_TICK_SEC / 2)
    expect(plane.lon).toBe(spawn.lon)
    expect(plane.lat).toBe(spawn.lat)

    sim.advance(SIM_TICK_SEC / 2)
    expect(plane.lat).not.toBe(spawn.lat)
  })

  it('reports the whole ticks stepped, counting banked sub-tick time', () => {
    const sim = new AircraftSim()
    sim.spawn(spawn)
    expect(sim.advance(SIM_TICK_SEC * 2.5)).toBe(2)
    expect(sim.advance(SIM_TICK_SEC / 2)).toBe(1)
    expect(sim.advance(0)).toBe(0)
  })

  it('rejects a negative or non-finite advance', () => {
    const sim = new AircraftSim()
    expect(() => sim.advance(-1)).toThrow(/deltaSec must be finite/)
    expect(() => sim.advance(Number.NaN)).toThrow(/deltaSec must be finite/)
  })
})
