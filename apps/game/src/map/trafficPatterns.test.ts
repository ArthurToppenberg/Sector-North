import { describe, it, expect } from 'vitest'
import { TRAFFIC_PATTERNS, type TrafficPattern } from './trafficPatterns'
import { AIRCRAFT_TYPES } from './aircraftTypes'
import { loadAirports } from './airports'
import { TrafficScheduler, TRAFFIC_SEED } from './trafficScheduler'
import { Rng } from './rng'
import { makeFail, requireLat, requireLon } from './validate'
import realAirports from '../data/airports.json'

function referencedAirportNames(p: TrafficPattern): string[] {
  if (p.kind === 'local') return [p.airportName]
  return p.route.flatMap((a) => (a.kind === 'airport' ? [a.name] : []))
}

describe('TRAFFIC_PATTERNS', () => {
  it('passes its module-load validation and is non-empty', () => {
    expect(TRAFFIC_PATTERNS.length).toBeGreaterThan(0)
  })

  it('references only airports present in the real bundled dataset', () => {
    const names = new Set(loadAirports(realAirports).map((a) => a.name))
    for (const p of TRAFFIC_PATTERNS) {
      for (const name of referencedAirportNames(p)) {
        expect(names.has(name), `${p.name} references ${name}`).toBe(true)
      }
    }
  })

  it('has unique names, positive rates, and known aircraft types', () => {
    const seen = new Set<string>()
    for (const p of TRAFFIC_PATTERNS) {
      expect(seen.has(p.name)).toBe(false)
      seen.add(p.name)
      expect(p.ratePerHour).toBeGreaterThan(0)
      expect(AIRCRAFT_TYPES[p.type]).toBeDefined()
    }
  })

  it('gives every flow at least two anchors with in-bounds coordinates', () => {
    // Judged with the shared validate.ts vocabulary — the WGS84 bounds live
    // there once, never restated here.
    const fail = makeFail('test/trafficPatterns')
    for (const p of TRAFFIC_PATTERNS) {
      if (p.kind !== 'flow') continue
      expect(p.route.length).toBeGreaterThanOrEqual(2)
      for (const anchor of p.route) {
        const ends =
          anchor.kind === 'point' ? [anchor] : anchor.kind === 'gate' ? [anchor.gate.a, anchor.gate.b] : []
        for (const end of ends) {
          expect(() => {
            requireLon(end.lon, fail, p.name)
            requireLat(end.lat, fail, p.name)
          }).not.toThrow()
        }
      }
    }
  })

  it('wires cleanly into a TrafficScheduler with the real airports and seed', () => {
    const airports = loadAirports(realAirports)
    expect(
      () => new TrafficScheduler(TRAFFIC_PATTERNS, airports, new Rng(TRAFFIC_SEED)),
    ).not.toThrow()
  })
})
