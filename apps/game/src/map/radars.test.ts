import { describe, it, expect } from 'vitest'
import { loadRadars } from './radars'
import realRadars from '../data/radars.json'

const valid = {
  name: 'Test Site',
  model: 'TPS-77',
  lon: 12.5,
  lat: 55.5,
  rangeKm: 470,
  updateIntervalSec: 10,
  manufacturer: 'Lockheed Martin',
  origin: 'USA',
  type: '3D long-range air surveillance radar',
  dimensionality: '3D',
  band: 'L',
  altitudeCeilingKm: 30.5,
  notes: 'A test radar.',
}

describe('loadRadars', () => {
  it('accepts the real bundled dataset', () => {
    const radars = loadRadars(realRadars)
    expect(radars.length).toBeGreaterThan(0)
    for (const r of radars) {
      expect(r.rangeKm).toBeGreaterThan(0)
      expect(r.updateIntervalSec).toBeGreaterThan(0)
      expect(['2D', '3D']).toContain(r.dimensionality)
    }
  })

  it('round-trips a valid record', () => {
    const [r] = loadRadars([valid])
    expect(r.name).toBe('Test Site')
    expect(r.altitudeCeilingKm).toBe(30.5)
  })

  it('accepts null as an explicit "no altitude ceiling" but rejects zero and junk', () => {
    expect(loadRadars([{ ...valid, altitudeCeilingKm: null }])[0].altitudeCeilingKm).toBeNull()
    expect(() => loadRadars([{ ...valid, altitudeCeilingKm: 0 }])).toThrow(/altitudeCeilingKm is non-positive/)
    expect(() => loadRadars([{ ...valid, altitudeCeilingKm: 'high' }])).toThrow(/altitudeCeilingKm is non-positive/)
  })

  it('rejects a non-array or empty payload', () => {
    expect(() => loadRadars(42)).toThrow(/non-empty array/)
    expect(() => loadRadars([])).toThrow(/non-empty array/)
  })

  it('rejects out-of-range coordinates', () => {
    expect(() => loadRadars([{ ...valid, lon: 181 }])).toThrow(/out-of-range lon/)
    expect(() => loadRadars([{ ...valid, lat: 91 }])).toThrow(/out-of-range lat/)
  })

  it('rejects non-positive range and update interval', () => {
    expect(() => loadRadars([{ ...valid, rangeKm: 0 }])).toThrow(/rangeKm is non-positive/)
    expect(() => loadRadars([{ ...valid, updateIntervalSec: -5 }])).toThrow(/updateIntervalSec is non-positive/)
  })

  it('rejects an unknown dimensionality', () => {
    expect(() => loadRadars([{ ...valid, dimensionality: '4D' }])).toThrow(/dimensionality is invalid/)
  })

  it('rejects missing spec/flavour strings', () => {
    for (const field of ['model', 'manufacturer', 'origin', 'type', 'band', 'notes']) {
      expect(() => loadRadars([{ ...valid, [field]: '' }])).toThrow(new RegExp(`${field} is missing or empty`))
    }
  })
})
