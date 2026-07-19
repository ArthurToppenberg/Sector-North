import type { Aircraft } from './aircraft'
import { bearingDeg, distanceKm, normalizeDeg } from './geo'
import { makeFail, requireLat, requireLon, requirePositiveNumber } from './validate'

const fail = makeFail('map/brain')

export interface Waypoint {
  readonly lon: number
  readonly lat: number
}

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
  return normalizeDeg((currentDeg + step) % 360)
}

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
