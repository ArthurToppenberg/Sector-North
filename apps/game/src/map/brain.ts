import type { Aircraft } from './aircraft'
import { KM_PER_DEG_LAT } from './project'
import { makeFail, requireLat, requireLon, requirePositiveNumber } from './validate'

const fail = makeFail('map/brain')

const DEG2RAD = Math.PI / 180

export interface Waypoint {
  readonly lon: number
  readonly lat: number
}

/**
 * Anything that steers an aircraft once per sim tick. `AircraftSim.advance`
 * calls `tick` inside its whole-tick loop, immediately before integrating the
 * position — so a brain only ever sees and produces tick-quantized state,
 * which is what keeps autonomous behavior bit-deterministic. A future
 * interceptor brain slots in here.
 */
export interface Brain {
  tick(ac: Aircraft, deltaSec: number): void
  /**
   * The route this brain intends to fly, if it has one — exposed so debug
   * rendering can show it. Presentation only: nothing may steer an aircraft
   * from here, that is `tick`'s job.
   */
  readonly waypoints?: readonly Waypoint[]
}

/**
 * How close (real km) an aircraft must pass to a waypoint to count it as
 * reached. At cruise speeds an aircraft moves tens of meters per tick, so a
 * 2 km capture radius can never be tunneled through in one step.
 */
export const WAYPOINT_CAPTURE_KM = 2

// Bearing and distance both use the same lat-corrected equirectangular metric
// as stepAircraft's integrator (cos(lat) on the longitude delta) —
// deliberately not colocate.ts's haversine, so the brain judges geometry
// exactly the way the aircraft will fly it.

/** Compass bearing (deg, 0 = north, 90 = east) from one point toward another. */
export function bearingDeg(fromLon: number, fromLat: number, toLon: number, toLat: number): number {
  const eastKm = (toLon - fromLon) * KM_PER_DEG_LAT * Math.cos(fromLat * DEG2RAD)
  const northKm = (toLat - fromLat) * KM_PER_DEG_LAT
  const deg = Math.atan2(eastKm, northKm) / DEG2RAD
  return deg < 0 ? deg + 360 : deg
}

function distanceKm(fromLon: number, fromLat: number, toLon: number, toLat: number): number {
  const eastKm = (toLon - fromLon) * KM_PER_DEG_LAT * Math.cos(fromLat * DEG2RAD)
  const northKm = (toLat - fromLat) * KM_PER_DEG_LAT
  return Math.hypot(eastKm, northKm)
}

/**
 * Turn from `currentDeg` toward `targetDeg` along the shortest arc, moving at
 * most `maxStepDeg`; snaps exactly onto the target once within one step.
 * Result is normalized to [0, 360).
 */
export function turnTowardDeg(currentDeg: number, targetDeg: number, maxStepDeg: number): number {
  if (!Number.isFinite(maxStepDeg) || maxStepDeg < 0) {
    fail(`maxStepDeg must be finite and >= 0, got ${maxStepDeg}`)
  }
  let diff = (targetDeg - currentDeg) % 360
  if (diff > 180) diff -= 360
  if (diff < -180) diff += 360
  const step = Math.abs(diff) <= maxStepDeg ? diff : Math.sign(diff) * maxStepDeg
  const next = (currentDeg + step) % 360
  return next < 0 ? next + 360 : next
}

/**
 * The simplest autonomous brain: fly the given waypoints in order with
 * rate-limited turns. Past the last waypoint it does nothing — the aircraft
 * holds its final heading and flies on; despawn/lifecycle is deliberately not
 * this module's business yet.
 */
export class RouteBrain implements Brain {
  readonly waypoints: readonly Waypoint[]
  private readonly turnRateDegPerSec: number
  private nextIndex = 0

  constructor(waypoints: readonly Waypoint[], turnRateDegPerSec: number) {
    if (!Array.isArray(waypoints) || waypoints.length === 0) {
      fail('RouteBrain needs a non-empty waypoint list')
    }
    waypoints.forEach((wp, i) => {
      requireLon(wp.lon, fail, `waypoint ${i}`)
      requireLat(wp.lat, fail, `waypoint ${i}`)
    })
    this.waypoints = waypoints
    this.turnRateDegPerSec = requirePositiveNumber(turnRateDegPerSec, fail, 'turnRateDegPerSec')
  }

  tick(ac: Aircraft, deltaSec: number): void {
    if (this.nextIndex >= this.waypoints.length) return
    const wp = this.waypoints[this.nextIndex]
    if (distanceKm(ac.lon, ac.lat, wp.lon, wp.lat) <= WAYPOINT_CAPTURE_KM) {
      this.nextIndex++
      if (this.nextIndex >= this.waypoints.length) return
    }
    const target = this.waypoints[this.nextIndex]
    ac.headingDeg = turnTowardDeg(
      ac.headingDeg,
      bearingDeg(ac.lon, ac.lat, target.lon, target.lat),
      this.turnRateDegPerSec * deltaSec,
    )
  }
}
