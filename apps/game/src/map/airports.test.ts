import { describe, it, expect } from 'vitest'
import { loadAirports } from './airports'
import realAirports from '../data/airports.json'

const valid = { name: 'Test Field', lon: 12.5, lat: 55.5, tier: 'major' }

describe('loadAirports', () => {
  it('accepts the real bundled dataset', () => {
    const airports = loadAirports(realAirports)
    expect(airports.length).toBeGreaterThan(0)
    for (const a of airports) {
      expect(['major', 'minor', 'military']).toContain(a.tier)
      expect(Number.isFinite(a.lon)).toBe(true)
      expect(Number.isFinite(a.lat)).toBe(true)
    }
  })

  it('accepts each valid tier', () => {
    for (const tier of ['major', 'minor', 'military']) {
      expect(loadAirports([{ ...valid, tier }])[0].tier).toBe(tier)
    }
  })

  it('rejects a non-array or empty payload', () => {
    expect(() => loadAirports('nope')).toThrow(/non-empty array/)
    expect(() => loadAirports([])).toThrow(/non-empty array/)
  })

  it('rejects a missing name', () => {
    expect(() => loadAirports([{ ...valid, name: '' }])).toThrow(/missing or empty/)
  })

  it('rejects out-of-range or non-numeric coordinates', () => {
    expect(() => loadAirports([{ ...valid, lon: 180.5 }])).toThrow(/out-of-range lon/)
    expect(() => loadAirports([{ ...valid, lat: -90.5 }])).toThrow(/out-of-range lat/)
    expect(() => loadAirports([{ ...valid, lon: '12' }])).toThrow(/out-of-range lon/)
    expect(() => loadAirports([{ ...valid, lat: Number.NaN }])).toThrow(/out-of-range lat/)
  })

  it('rejects an unknown tier', () => {
    expect(() => loadAirports([{ ...valid, tier: 'huge' }])).toThrow(/invalid tier/)
    expect(() => loadAirports([{ ...valid, tier: undefined }])).toThrow(/invalid tier/)
  })
})
