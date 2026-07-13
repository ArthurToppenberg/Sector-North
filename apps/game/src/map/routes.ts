import type { Waypoint } from './brain'
import { makeFail, requireLat, requireLon, requireNonEmptyArray } from './validate'

const fail = makeFail('map/routes')

export interface IntruderRoute {
  readonly spawn: Waypoint
  readonly waypoints: readonly Waypoint[]
}

export const INTRUDER_PROBE_ROUTE: IntruderRoute = {
  spawn: { lon: 16.8, lat: 55.1 },
  waypoints: [
    { lon: 14.6, lat: 54.9 },
    { lon: 13.2, lat: 55.1 },
    { lon: 15.2, lat: 55.6 },
    { lon: 17.0, lat: 55.8 },
  ],
}

requireLon(INTRUDER_PROBE_ROUTE.spawn.lon, fail, 'spawn')
requireLat(INTRUDER_PROBE_ROUTE.spawn.lat, fail, 'spawn')
requireNonEmptyArray(INTRUDER_PROBE_ROUTE.waypoints, fail, 'waypoints')
INTRUDER_PROBE_ROUTE.waypoints.forEach((wp, i) => {
  requireLon(wp.lon, fail, `waypoint ${i}`)
  requireLat(wp.lat, fail, `waypoint ${i}`)
})
