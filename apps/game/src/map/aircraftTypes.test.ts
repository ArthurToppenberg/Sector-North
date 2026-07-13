import { describe, it, expect } from 'vitest'
import { AIRCRAFT_TYPES, AIRCRAFT_TYPE_IDS } from './aircraftTypes'

describe('AIRCRAFT_TYPES', () => {
  it('lists every profile key in AIRCRAFT_TYPE_IDS and vice versa', () => {
    expect(Object.keys(AIRCRAFT_TYPES).sort()).toEqual([...AIRCRAFT_TYPE_IDS].sort())
  })

  it.each(AIRCRAFT_TYPE_IDS)('%s carries a consistent, physically sane profile', (typeId) => {
    const profile = AIRCRAFT_TYPES[typeId]
    expect(profile.typeId).toBe(typeId)
    expect(profile.name.length).toBeGreaterThan(0)
    expect(profile.cruiseSpeedKmh).toBeGreaterThan(0)
    expect(Number.isFinite(profile.cruiseSpeedKmh)).toBe(true)
    expect(profile.turnRateDegPerSec).toBeGreaterThan(0)
    expect(Number.isFinite(profile.turnRateDegPerSec)).toBe(true)
  })
})
