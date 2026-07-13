import type { Waypoint } from './brain'

export interface IntruderRoute {
  readonly spawn: Waypoint
  readonly waypoints: readonly Waypoint[]
}

/**
 * A Kaliningrad-style Baltic probing leg: enter from the east of Bornholm,
 * skirt Danish airspace toward the Øresund approach, then swing back out
 * east. Hardcoded for the MVP — route variation will need a seeded PRNG in
 * src/map/ (determinism rule), never Math.random().
 */
export const INTRUDER_PROBE_ROUTE: IntruderRoute = {
  spawn: { lon: 16.8, lat: 55.1 },
  waypoints: [
    { lon: 14.6, lat: 54.9 },
    { lon: 13.2, lat: 55.1 },
    { lon: 15.2, lat: 55.6 },
    { lon: 17.0, lat: 55.8 },
  ],
}
