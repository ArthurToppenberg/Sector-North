import denmarkRaw from '../data/denmark-boundary.geojson?raw'
import germanyRaw from '../data/germany-boundary.geojson?raw'
import norwayRaw from '../data/norway-boundary.geojson?raw'
import swedenRaw from '../data/sweden-boundary.geojson?raw'

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

/**
 * The bundled country boundaries, in draw order. Each is a fixed build-time
 * asset imported via Vite `?raw`; adding a neighbour is a one-line change here.
 */
const BOUNDARIES: ReadonlyArray<{ name: string; raw: string }> = [
  { name: 'denmark', raw: denmarkRaw },
  { name: 'germany', raw: germanyRaw },
  { name: 'norway', raw: norwayRaw },
  { name: 'sweden', raw: swedenRaw },
]

function fail(message: string): never {
  throw new Error(`[map/geojson] ${message}`)
}

function isFinitePair(value: unknown): value is LonLat {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  )
}

/** Validate a single closed ring, throwing on the first bad position. */
function parseRing(value: unknown, ctx: string): Ring {
  if (!Array.isArray(value) || value.length < 4) {
    fail(`${ctx}: ring has fewer than 4 positions (not a closed loop)`)
  }
  for (const point of value) {
    if (!isFinitePair(point)) fail(`${ctx}: invalid position ${JSON.stringify(point)}`)
  }
  return value as Ring
}

/** Validate one polygon: an outer ring followed by any holes. */
function parsePolygon(value: unknown, ctx: string): Polygon {
  if (!Array.isArray(value) || value.length === 0) fail(`${ctx}: polygon is empty`)
  return value.map((ring, i) => parseRing(ring, `${ctx} ring ${i}`))
}

/**
 * Parse and strictly validate one country's GeoJSON, flattening every feature's
 * geometry into a single MultiPolygon (a flat list of polygons). Accepts both
 * `Polygon` and `MultiPolygon` feature geometries and any number of features —
 * geoBoundaries splits some countries (e.g. Norway) into many island features.
 *
 * Fails loudly (throws) on any structural surprise rather than silently
 * degrading — the data is a fixed build-time asset, so anything unexpected is a
 * bug we want to see immediately.
 */
function parseBoundary(raw: string, name: string): MultiPolygon {
  const parsed: unknown = JSON.parse(raw)

  if (!parsed || typeof parsed !== 'object') fail(`${name}: root is not an object`)
  const root = parsed as Record<string, unknown>

  if (root.type !== 'FeatureCollection') {
    fail(`${name}: expected FeatureCollection, got ${JSON.stringify(root.type)}`)
  }
  if (!Array.isArray(root.features) || root.features.length === 0) {
    fail(`${name}: expected at least one feature, got ${(root.features as unknown[])?.length}`)
  }

  const polygons: MultiPolygon = []
  root.features.forEach((rawFeature, fi) => {
    const feature = rawFeature as Record<string, unknown>
    const geometry = feature.geometry as Record<string, unknown> | undefined
    const ctx = `${name} feature ${fi}`
    if (!geometry) fail(`${ctx}: missing geometry`)

    const coordinates = geometry.coordinates
    if (geometry.type === 'Polygon') {
      polygons.push(parsePolygon(coordinates, ctx))
    } else if (geometry.type === 'MultiPolygon') {
      if (!Array.isArray(coordinates) || coordinates.length === 0) {
        fail(`${ctx}: MultiPolygon has no polygons`)
      }
      coordinates.forEach((polygon, pi) => {
        polygons.push(parsePolygon(polygon, `${ctx} polygon ${pi}`))
      })
    } else {
      fail(`${ctx}: expected Polygon or MultiPolygon, got ${JSON.stringify(geometry.type)}`)
    }
  })

  if (polygons.length === 0) fail(`${name}: no polygons`)
  return polygons
}

/**
 * Load + validate every bundled country boundary and return them concatenated
 * into a single MultiPolygon in lon/lat degrees, ready to project as one map.
 */
export function loadBoundaries(): MultiPolygon {
  return BOUNDARIES.flatMap(({ name, raw }) => parseBoundary(raw, name))
}
