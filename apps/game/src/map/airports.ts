import raw from '../data/airports.json?raw'

/**
 * Coarse importance tier, used by the render layer to decide what shows at which
 * zoom (majors + airbases always; minor strips only once zoomed in). Assigned at
 * build time by `scripts/build-airports.mjs` from the OSM name.
 */
export type AirportTier = 'major' | 'minor' | 'military'

const TIERS: ReadonlySet<AirportTier> = new Set(['major', 'minor', 'military'])

/** A single airfield in lon/lat degrees (WGS84 / CRS84). */
export interface Airport {
  name: string
  lon: number
  lat: number
  tier: AirportTier
}

function fail(message: string): never {
  throw new Error(`[map/airports] ${message}`)
}

/** True only for real, finite numbers — rejects strings, NaN, and ±Infinity while narrowing. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isAirportTier(value: unknown): value is AirportTier {
  return typeof value === 'string' && TIERS.has(value as AirportTier)
}

/**
 * Validate one entry from the bundled list and return a typed `Airport`, or throw.
 * Every branch narrows the field so the returned object needs no casts.
 */
function parseAirport(entry: unknown, index: number): Airport {
  if (!entry || typeof entry !== 'object') fail(`airport ${index} is not an object`)
  const { name, lon, lat, tier } = entry as Record<string, unknown>

  if (typeof name !== 'string' || name.length === 0) fail(`airport ${index} has no name`)
  if (!isFiniteNumber(lon) || lon < -180 || lon > 180) {
    fail(`airport ${name} has out-of-range lon: ${JSON.stringify(lon)}`)
  }
  if (!isFiniteNumber(lat) || lat < -90 || lat > 90) {
    fail(`airport ${name} has out-of-range lat: ${JSON.stringify(lat)}`)
  }
  if (!isAirportTier(tier)) fail(`airport ${name} has invalid tier: ${JSON.stringify(tier)}`)

  return { name, lon, lat, tier }
}

/**
 * Parse and strictly validate the bundled airport list — the distilled output of
 * `scripts/build-airports.mjs`, not the raw OSM dump. Like the cities and
 * boundary data this is a fixed build-time asset, so anything unexpected is a bug
 * we surface immediately (fail fast) rather than skipping.
 *
 * Every airfield is returned as its own field — co-located sites (a military
 * airbase sharing a runway with a civil airport, or a radar on the same base) are
 * NOT collapsed here. Each keeps its own glyph; only their *labels* are combined,
 * downstream and across types, by `resolveColocationLabels` (see `colocate.ts`).
 */
export function loadAirports(): Airport[] {
  const parsed: unknown = JSON.parse(raw)

  if (!Array.isArray(parsed) || parsed.length === 0) {
    fail('expected a non-empty array of airports')
  }

  return parsed.map(parseAirport)
}
