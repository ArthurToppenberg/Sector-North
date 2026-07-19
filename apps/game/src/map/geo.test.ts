import { describe, it, expect } from 'vitest'
import { bearingDeg, distanceKm, localKm, normalizeDeg } from './geo'
import { KM_PER_DEG_LAT } from './project'

const DEG2RAD = Math.PI / 180

describe('localKm', () => {
  it('converts a pure latitude separation at KM_PER_DEG_LAT per degree', () => {
    expect(localKm(12, 55, 12, 56)).toEqual([0, KM_PER_DEG_LAT])
  })

  it('narrows the east separation by cos(fromLat)', () => {
    const [eastKm, northKm] = localKm(12, 60, 13, 60)
    expect(eastKm).toBeCloseTo(KM_PER_DEG_LAT * Math.cos(60 * DEG2RAD), 10)
    expect(northKm).toBe(0)
  })
})

describe('normalizeDeg', () => {
  it('shifts a negative angle up by one turn and leaves non-negatives alone', () => {
    expect(normalizeDeg(-90)).toBe(270)
    expect(normalizeDeg(0)).toBe(0)
    expect(normalizeDeg(359)).toBe(359)
  })
})

describe('bearingDeg', () => {
  it('returns the cardinal bearings exactly', () => {
    expect(bearingDeg(12, 55, 12, 56)).toBe(0)
    expect(bearingDeg(12, 55, 13, 55)).toBe(90)
    expect(bearingDeg(12, 55, 12, 54)).toBe(180)
    expect(bearingDeg(12, 55, 11, 55)).toBe(270)
  })

  it('applies the cos(latitude) correction to east-west separation', () => {
    // At 60°N a degree of longitude is half a degree of latitude wide, so a
    // 1°-east 0.5°-north target sits exactly northeast (45°).
    expect(bearingDeg(12, 60, 13, 60.5)).toBeCloseTo(45, 10)
  })
})

describe('distanceKm', () => {
  it('measures a pure north separation as whole degrees of latitude', () => {
    expect(distanceKm(12, 55, 12, 56)).toBe(KM_PER_DEG_LAT)
  })

  it('measures a diagonal with the lat-corrected equirectangular metric', () => {
    const [eastKm, northKm] = localKm(12, 55, 13, 55.5)
    expect(distanceKm(12, 55, 13, 55.5)).toBeCloseTo(Math.hypot(eastKm, northKm), 10)
  })
})
