import { describe, it, expect } from 'vitest'
import { bearingDeg, distanceKm, localKm, normalizeDeg, offsetKm } from './geo'
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

describe('offsetKm', () => {
  it('returns the origin exactly at zero distance', () => {
    expect(offsetKm(12, 55, 137, 0)).toEqual([12, 55])
  })

  it('moves due north by latitude only, at KM_PER_DEG_LAT per degree', () => {
    expect(offsetKm(12, 55, 0, KM_PER_DEG_LAT)).toEqual([12, 56])
  })

  it('moves due east by longitude only, widened by 1/cos(lat)', () => {
    const [lon, lat] = offsetKm(12, 56, 90, 50)
    expect(lon - 12).toBeCloseTo(50 / (KM_PER_DEG_LAT * Math.cos(56 * DEG2RAD)), 10)
    expect(lon).toBeGreaterThan(12)
    expect(lat).toBeCloseTo(56, 10)
  })

  it('mirrors north/east with south/west', () => {
    const [, northLat] = offsetKm(12, 55, 0, 30)
    const [southLon, southLat] = offsetKm(12, 55, 180, 30)
    expect(55 - southLat).toBeCloseTo(northLat - 55, 10)
    expect(southLon).toBeCloseTo(12, 10)

    const [eastLon] = offsetKm(12, 55, 90, 30)
    const [westLon, westLat] = offsetKm(12, 55, 270, 30)
    expect(12 - westLon).toBeCloseTo(eastLon - 12, 10)
    expect(westLat).toBeCloseTo(55, 10)
  })

  it('inverts distanceKm and bearingDeg from the same origin', () => {
    // The metric is lat-corrected at the *origin*, so the round trip is exact
    // up to floating point even when the destination latitude differs.
    const origins: Array<[lon: number, lat: number]> = [
      [10.5, 55.2],
      [12.6, 56.9],
      [8.1, 57.1],
    ]
    const legs: Array<[bearingDeg: number, distKm: number]> = [
      [0, 80],
      [90, 120],
      [180, 45],
      [270, 200],
      [37, 150],
      [135, 60],
      [222.5, 90],
      [301, 340],
    ]
    for (const [fromLon, fromLat] of origins) {
      for (const [bearing, dist] of legs) {
        const [toLon, toLat] = offsetKm(fromLon, fromLat, bearing, dist)
        expect(distanceKm(fromLon, fromLat, toLon, toLat)).toBeCloseTo(dist, 9)
        expect(bearingDeg(fromLon, fromLat, toLon, toLat)).toBeCloseTo(bearing, 9)
      }
    }
  })
})
