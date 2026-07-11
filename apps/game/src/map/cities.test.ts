import { describe, it, expect } from 'vitest'
import { loadMajorCities } from './cities'
import realCities from '../data/major-cities.json'

const valid = {
  city: 'Testby',
  latitude: 55.5,
  longitude: 12.5,
  population: 1000,
  region: 'Test Region',
  founded: '1868',
  notes: 'A test city.',
}

describe('loadMajorCities', () => {
  it('accepts the real bundled dataset', () => {
    const cities = loadMajorCities(realCities)
    expect(cities.length).toBeGreaterThan(0)
    for (const c of cities) {
      expect(c.name).not.toBe('')
      expect(Number.isFinite(c.lon)).toBe(true)
      expect(Number.isFinite(c.lat)).toBe(true)
    }
  })

  it('renames the source fields onto the domain shape', () => {
    const [c] = loadMajorCities([valid])
    expect(c).toEqual({
      name: 'Testby',
      lon: 12.5,
      lat: 55.5,
      population: 1000,
      region: 'Test Region',
      founded: '1868',
      notes: 'A test city.',
    })
  })

  it('rejects a non-array or empty payload', () => {
    expect(() => loadMajorCities({})).toThrow(/non-empty array/)
    expect(() => loadMajorCities([])).toThrow(/non-empty array/)
  })

  it('rejects a non-object entry and a missing name', () => {
    expect(() => loadMajorCities([null])).toThrow(/not an object/)
    expect(() => loadMajorCities([{ ...valid, city: '' }])).toThrow(/has no name/)
  })

  it('rejects out-of-range or non-numeric coordinates', () => {
    expect(() => loadMajorCities([{ ...valid, longitude: 181 }])).toThrow(/out-of-range longitude/)
    expect(() => loadMajorCities([{ ...valid, longitude: -181 }])).toThrow(/out-of-range longitude/)
    expect(() => loadMajorCities([{ ...valid, latitude: 91 }])).toThrow(/out-of-range latitude/)
    expect(() => loadMajorCities([{ ...valid, latitude: '55' }])).toThrow(/out-of-range latitude/)
    expect(() => loadMajorCities([{ ...valid, latitude: Number.NaN }])).toThrow(/out-of-range latitude/)
  })

  it('rejects an invalid population', () => {
    expect(() => loadMajorCities([{ ...valid, population: -1 }])).toThrow(/invalid population/)
    expect(() => loadMajorCities([{ ...valid, population: '1000' }])).toThrow(/invalid population/)
  })

  it('rejects missing flavour metadata', () => {
    expect(() => loadMajorCities([{ ...valid, region: '' }])).toThrow(/has no region/)
    expect(() => loadMajorCities([{ ...valid, founded: undefined }])).toThrow(/has no founded/)
    expect(() => loadMajorCities([{ ...valid, notes: 42 }])).toThrow(/has no notes/)
  })
})
