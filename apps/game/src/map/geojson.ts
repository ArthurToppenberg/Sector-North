import denmarkUrl from '../data/borders/denmark-boundary.json?url'
import germanyUrl from '../data/borders/germany-boundary.json?url'
import netherlandsUrl from '../data/borders/netherlands-boundary.json?url'
import norwayUrl from '../data/borders/norway-boundary.json?url'
import polandUrl from '../data/borders/poland-boundary.json?url'
import swedenUrl from '../data/borders/sweden-boundary.json?url'

/** A [longitude, latitude] pair in degrees (WGS84 / CRS84). */
export type LonLat = [number, number]

/**
 * A single linear ring: a closed loop of positions. GeoJSON polygons list the
 * outer boundary first, followed by any holes.
 */
export type Ring = LonLat[]

/** One polygon: `[outerRing, ...holes]`. */
export type Polygon = Ring[]

/** MultiPolygon coordinates: `[polygon, ...]`. */
export type MultiPolygon = Polygon[]

/** A country boundary asset: its name (also its cache key) and emitted URL. */
export interface BoundaryAsset {
  name: string
  url: string
}

/**
 * The country boundaries, in draw order. Each is a fixed build-time asset
 * imported via Vite `?url`, so the file is emitted to `dist/` and fetched at
 * runtime (rather than inlined into the JS bundle). Adding a neighbour is a
 * one-line change here. The consumer loads each `url` and hands the parsed JSON
 * back to `loadBoundaries` keyed by `name`.
 */
export const BOUNDARY_ASSETS: ReadonlyArray<BoundaryAsset> = [
  { name: 'denmark', url: denmarkUrl },
  { name: 'germany', url: germanyUrl },
  { name: 'netherlands', url: netherlandsUrl },
  { name: 'norway', url: norwayUrl },
  { name: 'poland', url: polandUrl },
  { name: 'sweden', url: swedenUrl },
]

function fail(message: string): never {
  throw new Error(`[map/geojson] ${message}`)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * A GeoJSON position with a finite lon/lat inside valid WGS84 ranges. The third
 * (altitude) element permitted by the spec is ignored — this map is 2D — but a
 * position with fewer than two coordinates, non-finite values, or coordinates
 * out of range (a classic sign of swapped lon/lat) is rejected.
 */
function parsePosition(value: unknown, ctx: string): LonLat {
  if (!Array.isArray(value) || value.length < 2) {
    fail(`${ctx}: position is not a [lon, lat] pair: ${JSON.stringify(value)}`)
  }
  const [lon, lat] = value as unknown[]
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    fail(`${ctx}: non-finite position ${JSON.stringify(value)}`)
  }
  if ((lon as number) < -180 || (lon as number) > 180) {
    fail(`${ctx}: longitude out of range: ${JSON.stringify(lon)}`)
  }
  if ((lat as number) < -90 || (lat as number) > 90) {
    fail(`${ctx}: latitude out of range: ${JSON.stringify(lat)}`)
  }
  return [lon as number, lat as number]
}

/** Validate a single closed ring, throwing on the first bad position. */
function parseRing(value: unknown, ctx: string): Ring {
  if (!Array.isArray(value) || value.length < 4) {
    fail(`${ctx}: ring has fewer than 4 positions (not a closed loop)`)
  }
  return value.map((point, i) => parsePosition(point, `${ctx} position ${i}`))
}

/** Validate one polygon: an outer ring followed by any holes. */
function parsePolygon(value: unknown, ctx: string): Polygon {
  if (!Array.isArray(value) || value.length === 0) fail(`${ctx}: polygon is empty`)
  return value.map((ring, i) => parseRing(ring, `${ctx} ring ${i}`))
}

/**
 * Validate one feature's geometry, returning its polygons. Accepts both
 * `Polygon` (one polygon) and `MultiPolygon` (many) geometries — geoBoundaries
 * splits some countries (e.g. Norway) into many island features/polygons.
 */
function parseGeometry(geometry: unknown, ctx: string): Polygon[] {
  if (!isObject(geometry)) fail(`${ctx}: geometry is not an object`)
  const { type, coordinates } = geometry

  if (type === 'Polygon') {
    return [parsePolygon(coordinates, ctx)]
  }
  if (type === 'MultiPolygon') {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      fail(`${ctx}: MultiPolygon has no polygons`)
    }
    return coordinates.map((polygon, pi) => parsePolygon(polygon, `${ctx} polygon ${pi}`))
  }
  fail(`${ctx}: expected Polygon or MultiPolygon, got ${JSON.stringify(type)}`)
}

/**
 * Parse and strictly validate one country's GeoJSON, flattening every feature's
 * geometry into a single MultiPolygon (a flat list of polygons).
 *
 * Fails loudly (throws) on any structural surprise rather than silently
 * degrading — the data is a fixed build-time asset, so anything unexpected is a
 * bug we want to see immediately.
 */
function parseBoundary(parsed: unknown, name: string): MultiPolygon {
  if (!isObject(parsed)) fail(`${name}: root is not an object`)

  if (parsed.type !== 'FeatureCollection') {
    fail(`${name}: expected FeatureCollection, got ${JSON.stringify(parsed.type)}`)
  }
  if (!Array.isArray(parsed.features) || parsed.features.length === 0) {
    fail(`${name}: expected a non-empty features array, got ${JSON.stringify(parsed.features)}`)
  }

  return parsed.features.flatMap((feature, fi) => {
    const ctx = `${name} feature ${fi}`
    if (!isObject(feature)) fail(`${ctx}: feature is not an object`)
    if (feature.type !== 'Feature') {
      fail(`${ctx}: expected Feature, got ${JSON.stringify(feature.type)}`)
    }
    return parseGeometry(feature.geometry, ctx)
  })
}

/**
 * Validate every country boundary and return them concatenated into a single
 * MultiPolygon in lon/lat degrees, ready to project as one map.
 *
 * `getJson(name)` returns the already-parsed JSON for the asset previously
 * fetched under that `name` (see `BOUNDARY_ASSETS`). This keeps the module
 * Phaser-free: the caller owns the loader; we own the validation. A missing or
 * failed asset surfaces here as `getJson` returning something non-object, which
 * `parseBoundary` rejects loudly.
 */
export function loadBoundaries(getJson: (name: string) => unknown): MultiPolygon {
  return BOUNDARY_ASSETS.flatMap(({ name }) => parseBoundary(getJson(name), name))
}
