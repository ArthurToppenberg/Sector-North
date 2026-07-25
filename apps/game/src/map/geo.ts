// Shared lat-corrected equirectangular geometry. Both the steering brain and
// the radar field must judge geometry with the same metric the aircraft fly —
// stepAircraft's lat-corrected equirectangular step — which is why this is
// deliberately NOT colocate.ts's haversine: a sensor or brain measuring with a
// different metric than the motion model would disagree with the flown path.
import { DEG2RAD } from './aircraft'
import { KM_PER_DEG_LAT } from './project'

/** The east/north km separation between two points, lat-corrected at `fromLat`. */
export function localKm(
  fromLon: number,
  fromLat: number,
  toLon: number,
  toLat: number,
): [eastKm: number, northKm: number] {
  return [(toLon - fromLon) * KM_PER_DEG_LAT * Math.cos(fromLat * DEG2RAD), (toLat - fromLat) * KM_PER_DEG_LAT]
}

export function normalizeDeg(deg: number): number {
  return deg < 0 ? deg + 360 : deg
}

/** Compass bearing (deg, 0 = north, 90 = east) from one point toward another. */
export function bearingDeg(fromLon: number, fromLat: number, toLon: number, toLat: number): number {
  const [eastKm, northKm] = localKm(fromLon, fromLat, toLon, toLat)
  return normalizeDeg(Math.atan2(eastKm, northKm) / DEG2RAD)
}

export function distanceKm(fromLon: number, fromLat: number, toLon: number, toLat: number): number {
  const [eastKm, northKm] = localKm(fromLon, fromLat, toLon, toLat)
  return Math.hypot(eastKm, northKm)
}

/**
 * The point `distKm` from the origin along a compass bearing — the inverse of
 * this module's metric (lat-corrected at the origin, like stepAircraft), so a
 * waypoint generated with it lies where flying that bearing would arrive.
 */
export function offsetKm(
  lon: number,
  lat: number,
  bearing: number,
  distKm: number,
): [lon: number, lat: number] {
  const bearingRad = bearing * DEG2RAD
  return [
    lon + (distKm * Math.sin(bearingRad)) / (KM_PER_DEG_LAT * Math.cos(lat * DEG2RAD)),
    lat + (distKm * Math.cos(bearingRad)) / KM_PER_DEG_LAT,
  ]
}
