import { describe, it, expect } from 'vitest'
import { stepAircraft, AircraftSim, type Aircraft } from './aircraft'
import { KM_PER_DEG_LAT } from './project'

const DEG2RAD = Math.PI / 180

function aircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return { id: 1, lon: 12, lat: 55, headingDeg: 0, speedKmh: KM_PER_DEG_LAT, ...overrides }
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
  it('spawns aircraft with sequential ids starting at 1', () => {
    const sim = new AircraftSim()
    const a = sim.spawn({ lon: 12, lat: 55, headingDeg: 0, speedKmh: 800 })
    const b = sim.spawn({ lon: 12, lat: 55, headingDeg: 90, speedKmh: 800 })
    expect(a.id).toBe(1)
    expect(b.id).toBe(2)
    expect(sim.count).toBe(2)
  })

  it('rejects out-of-range or non-finite spawn parameters', () => {
    const sim = new AircraftSim()
    const valid = { lon: 12, lat: 55, headingDeg: 0, speedKmh: 800 }
    expect(() => sim.spawn({ ...valid, lon: 181 })).toThrow(/lon out of range/)
    expect(() => sim.spawn({ ...valid, lat: -91 })).toThrow(/lat out of range/)
    expect(() => sim.spawn({ ...valid, headingDeg: Number.NaN })).toThrow(/headingDeg not finite/)
    expect(() => sim.spawn({ ...valid, speedKmh: -1 })).toThrow(/speedKmh must be finite/)
  })

  it('advances every aircraft on step', () => {
    const sim = new AircraftSim()
    const north = sim.spawn({ lon: 12, lat: 55, headingDeg: 0, speedKmh: 800 })
    const east = sim.spawn({ lon: 12, lat: 55, headingDeg: 90, speedKmh: 800 })
    sim.step(60)
    expect(north.lat).toBeGreaterThan(55)
    expect(east.lon).toBeGreaterThan(12)
  })

  it('clear removes all aircraft and reports how many', () => {
    const sim = new AircraftSim()
    sim.spawn({ lon: 12, lat: 55, headingDeg: 0, speedKmh: 800 })
    sim.spawn({ lon: 12, lat: 55, headingDeg: 90, speedKmh: 800 })
    expect(sim.clear()).toBe(2)
    expect(sim.count).toBe(0)
    expect(sim.all).toHaveLength(0)
  })
})
