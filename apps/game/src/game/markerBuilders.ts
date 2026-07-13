// Pure record → marker mappers between src/map/ world data and the render
// layers' marker shapes. Type-only imports keep this module free of runtime
// Phaser, so it is node-testable like the map/ modules it joins.
import type { City } from '../map/cities'
import type { Airport, AirportTier } from '../map/airports'
import type { Radar } from '../map/radars'
import type { ColocationInput, ColocationLabel } from '../map/colocate'
import type { Projector } from '../map/project'
import type { CityMarker } from './CityLayer'
import type { AirportMarker } from './AirportLayer'
import type { RadarMarker } from './RadarLayer'
import type { RadarSweepMarker } from './RadarSweepLayer'

/**
 * Colocation label-ownership ranking: military airfield < major < minor < radar,
 * so a base's own name beats the radar on it.
 */
export const AIRPORT_LABEL_PRIORITY: Record<AirportTier, number> = { military: 0, major: 1, minor: 2 }
export const RADAR_LABEL_PRIORITY = 3

/**
 * Airports first, then radars — the same ordering every colocation consumer
 * relies on to slice results back apart at `airports.length`.
 */
export function buildColocationInputs(
  airports: readonly Airport[],
  radars: readonly Radar[],
): ColocationInput[] {
  return [
    ...airports.map((a) => ({ name: a.name, lon: a.lon, lat: a.lat, priority: AIRPORT_LABEL_PRIORITY[a.tier] })),
    ...radars.map((r) => ({ name: r.name, lon: r.lon, lat: r.lat, priority: RADAR_LABEL_PRIORITY })),
  ]
}

export function buildCityMarkers(cities: readonly City[], project: Projector): CityMarker[] {
  return cities.map((c) => {
    const [x, y] = project(c.lon, c.lat)
    return { name: c.name, x, y, lon: c.lon, lat: c.lat, population: c.population }
  })
}

export function buildAirportMarkers(
  airports: readonly Airport[],
  project: Projector,
  labels: readonly ColocationLabel[],
): AirportMarker[] {
  return airports.map((a, i) => {
    const [x, y] = project(a.lon, a.lat)
    const { label, suppressed } = labels[i]
    return { name: a.name, label, labelSuppressed: suppressed, x, y, lon: a.lon, lat: a.lat, tier: a.tier }
  })
}

export function buildRadarMarkers(
  radars: readonly Radar[],
  project: Projector,
  labels: readonly ColocationLabel[],
): RadarMarker[] {
  return radars.map((r, i) => {
    const [x, y] = project(r.lon, r.lat)
    const { label, suppressed } = labels[i]
    return { name: r.name, model: r.model, label, labelSuppressed: suppressed, x, y, lon: r.lon, lat: r.lat }
  })
}

export function buildRadarSweepMarkers(radars: readonly Radar[], project: Projector): RadarSweepMarker[] {
  return radars.map((r) => {
    const [x, y] = project(r.lon, r.lat)
    return { name: r.name, x, y, rangeKm: r.rangeKm, updateIntervalSec: r.updateIntervalSec }
  })
}
