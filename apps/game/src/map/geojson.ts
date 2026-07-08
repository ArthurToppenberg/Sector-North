import denmarkUrl from '../data/borders/denmark-boundary.json?url'
import germanyUrl from '../data/borders/germany-boundary.json?url'
import netherlandsUrl from '../data/borders/netherlands-boundary.json?url'
import norwayUrl from '../data/borders/norway-boundary.json?url'
import polandUrl from '../data/borders/poland-boundary.json?url'
import swedenUrl from '../data/borders/sweden-boundary.json?url'

export type LonLat = [number, number]

export type Ring = LonLat[]

export type Polygon = Ring[]

export type MultiPolygon = Polygon[]

export interface BoundaryAsset {
  name: string
  url: string
}

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

const LON_MIN = -180
const LON_MAX = 180
const LAT_MIN = -90
const LAT_MAX = 90

function parseCoordinate(value: unknown, min: number, max: number, label: string, ctx: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${ctx}: non-finite ${label}: ${JSON.stringify(value)}`)
  }
  if (value < min || value > max) {
    fail(`${ctx}: ${label} out of range [${min}, ${max}]: ${JSON.stringify(value)}`)
  }
  return value
}

/**
 * The third (altitude) element permitted by the spec is ignored — this map is 2D.
 */
function parsePosition(value: unknown, ctx: string): LonLat {
  if (!Array.isArray(value) || value.length < 2) {
    fail(`${ctx}: position is not a [lon, lat] pair: ${JSON.stringify(value)}`)
  }
  const lon = parseCoordinate(value[0], LON_MIN, LON_MAX, 'longitude', ctx)
  const lat = parseCoordinate(value[1], LAT_MIN, LAT_MAX, 'latitude', ctx)
  return [lon, lat]
}

function parseRing(value: unknown, ctx: string): Ring {
  if (!Array.isArray(value) || value.length < 4) {
    fail(`${ctx}: ring has fewer than 4 positions (not a closed loop)`)
  }
  return value.map((point, i) => parsePosition(point, `${ctx} position ${i}`))
}

function parsePolygon(value: unknown, ctx: string): Polygon {
  if (!Array.isArray(value) || value.length === 0) fail(`${ctx}: polygon is empty`)
  return value.map((ring, i) => parseRing(ring, `${ctx} ring ${i}`))
}

/**
 * Accepts both Polygon and MultiPolygon — geoBoundaries splits some countries
 * (e.g. Norway) into many island polygons.
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

export function loadBoundaries(getJson: (name: string) => unknown): MultiPolygon {
  return BOUNDARY_ASSETS.flatMap(({ name }) => parseBoundary(getJson(name), name))
}
