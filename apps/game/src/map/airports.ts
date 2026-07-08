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

/**
 * Parse and strictly validate the bundled airport list — the distilled output of
 * `scripts/build-airports.mjs`, not the raw OSM dump. Like the cities and
 * boundary data this is a fixed build-time asset, so anything unexpected is a bug
 * we surface immediately (fail fast) rather than skipping.
 */
export function loadAirports(): Airport[] {
  const parsed: unknown = JSON.parse(raw)

  if (!Array.isArray(parsed) || parsed.length === 0) {
    fail('expected a non-empty array of airports')
  }

  return parsed.map((entry, i): Airport => {
    if (!entry || typeof entry !== 'object') fail(`airport ${i} is not an object`)
    const { name, lon, lat, tier } = entry as Record<string, unknown>

    if (typeof name !== 'string' || name.length === 0) fail(`airport ${i} has no name`)
    if (!Number.isFinite(lon)) fail(`airport ${name} has invalid lon: ${JSON.stringify(lon)}`)
    if (!Number.isFinite(lat)) fail(`airport ${name} has invalid lat: ${JSON.stringify(lat)}`)
    if (typeof tier !== 'string' || !TIERS.has(tier as AirportTier)) {
      fail(`airport ${name} has invalid tier: ${JSON.stringify(tier)}`)
    }

    return { name, lon: lon as number, lat: lat as number, tier: tier as AirportTier }
  })
}
