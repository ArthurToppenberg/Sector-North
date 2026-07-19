// Pure record → marker mappers between src/map/ world data and the render
// layers' marker shapes. Runtime imports come only from src/map/ (never
// Phaser), so it is node-testable like the map/ modules it joins.
import { KM_PER_DEG_LAT } from '../map/project'
import { DEG2RAD } from '../map/aircraft'
import type { City } from '../map/cities'
import type { Airport, AirportTier } from '../map/airports'
import type { Radar } from '../map/radars'
import type { ColocationInput, ColocationLabel } from '../map/colocate'
import type { Projector } from '../map/project'
import type { RadarSite } from '../map/radarField'
import type { CityMarker } from './layers/CityLayer'
import type { AirportMarker } from './layers/AirportLayer'
import type { RadarMarker } from './layers/RadarLayer'
import type { RadarSweepMarker } from './layers/RadarSweepLayer'

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

/**
 * Index alignment invariant: `buildRadarSweepMarkers` and `buildRadarSites` must
 * be fed the same `radars` array, so sweep marker i and `RadarField` site i are
 * the same physical radar — `RadarSweepLayer.draw` presents field state through
 * the markers by index (and asserts the counts match).
 */
export function buildRadarSweepMarkers(radars: readonly Radar[], project: Projector): RadarSweepMarker[] {
  return radars.map((r) => {
    const [x, y] = project(r.lon, r.lat)
    // The detection boundary RadarField judges is a real-km disc in geo.ts's
    // localKm metric, lat-corrected at the SITE's latitude — while the
    // projection compresses longitude at the frame's mean latitude. The disc
    // therefore projects to an ellipse, not a circle, and drawing a circle of
    // rangeKm × pixelsPerKm would overstate east–west coverage by up to ~11%
    // here (sites lie south of the frame's mean latitude). The projection is
    // linear in dLon/dLat, so projecting the boundary's due-east and due-north
    // points yields the exact semi-axes; the drawn ring then coincides with
    // the sensing edge at every bearing.
    const [eastX] = project(r.lon + r.rangeKm / (KM_PER_DEG_LAT * Math.cos(r.lat * DEG2RAD)), r.lat)
    const [, northY] = project(r.lon, r.lat + r.rangeKm / KM_PER_DEG_LAT)
    return { name: r.name, x, y, rangeXPx: eastX - x, rangeYPx: y - northY }
  })
}

export function buildRadarSites(radars: readonly Radar[]): RadarSite[] {
  return radars.map((r) => ({
    name: r.name,
    lon: r.lon,
    lat: r.lat,
    rangeKm: r.rangeKm,
    updateIntervalSec: r.updateIntervalSec,
  }))
}
