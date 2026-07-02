import raw from '../data/denmark-boundary.geojson?raw'

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

/**
 * Parse and strictly validate the bundled Denmark boundary, returning its
 * MultiPolygon coordinates in lon/lat degrees.
 *
 * Fails loudly (throws) on any structural surprise rather than silently
 * degrading — the data is a fixed build-time asset, so anything unexpected is a
 * bug we want to see immediately.
 */
export function loadDenmarkMultiPolygon(): MultiPolygon {
  const parsed: unknown = JSON.parse(raw)

  if (!parsed || typeof parsed !== 'object') fail('root is not an object')
  const root = parsed as Record<string, unknown>

  if (root.type !== 'FeatureCollection') {
    fail(`expected FeatureCollection, got ${JSON.stringify(root.type)}`)
  }
  if (!Array.isArray(root.features) || root.features.length !== 1) {
    fail(`expected exactly one feature, got ${(root.features as unknown[])?.length}`)
  }

  const feature = root.features[0] as Record<string, unknown>
  const geometry = feature.geometry as Record<string, unknown> | undefined
  if (!geometry || geometry.type !== 'MultiPolygon') {
    fail(`expected MultiPolygon geometry, got ${JSON.stringify(geometry?.type)}`)
  }

  const coordinates = geometry.coordinates
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    fail('MultiPolygon has no polygons')
  }

  // Validate every position down to the leaf; throw on the first bad point.
  for (const polygon of coordinates as unknown[]) {
    if (!Array.isArray(polygon) || polygon.length === 0) fail('polygon is empty')
    for (const ring of polygon as unknown[]) {
      if (!Array.isArray(ring) || ring.length < 4) {
        fail('ring has fewer than 4 positions (not a closed loop)')
      }
      for (const point of ring as unknown[]) {
        if (!isFinitePair(point)) fail(`invalid position: ${JSON.stringify(point)}`)
      }
    }
  }

  return coordinates as MultiPolygon
}
