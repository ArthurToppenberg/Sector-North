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
 * Merge radius (km) for collapsing a military airbase and a co-located civil
 * airport into one combined field. Several Danish sites (Aalborg, Karup,
 * Skrydstrup) host a major civil airport and a military airbase sharing the same
 * runways a couple of km apart; this radius captures such pairs without pulling
 * in genuinely separate fields. A real-world distance, so it lives here (in the
 * GPS/world layer) in km, not with the on-screen pixel constants in `config.ts`.
 */
const MILITARY_MERGE_RADIUS_KM = 6

/**
 * Great-circle distance between two airfields in kilometres (haversine). Used
 * only to decide co-location, so the exact earth radius is immaterial.
 */
function distanceKm(a: Airport, b: Airport): number {
  const earthRadiusKm = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h))
}

/**
 * Collapse each military airbase that sits within `MILITARY_MERGE_RADIUS_KM` of a
 * major (civil) airport into a single combined field: one large military marker
 * carrying both names joined by " & " (civil first, e.g. "Aalborg Airport &
 * Aalborg Air Base"), placed at the midpoint of the pair. Each major airport can
 * be claimed by at most one airbase (the nearest); minor strips are never merged.
 * Unmerged fields pass through unchanged.
 */
function mergeColocatedMilitary(airports: readonly Airport[]): Airport[] {
  const majors = airports.filter((a) => a.tier === 'major')
  const claimedMajors = new Set<Airport>()
  const result: Airport[] = []

  for (const airport of airports) {
    if (airport.tier !== 'military') continue

    const partner = majors
      .filter((m) => !claimedMajors.has(m) && distanceKm(airport, m) <= MILITARY_MERGE_RADIUS_KM)
      .sort((a, b) => distanceKm(airport, a) - distanceKm(airport, b))[0]

    if (!partner) {
      result.push(airport)
      continue
    }

    claimedMajors.add(partner)
    result.push({
      name: `${partner.name} & ${airport.name}`,
      lon: (airport.lon + partner.lon) / 2,
      lat: (airport.lat + partner.lat) / 2,
      tier: 'military',
    })
  }

  // Every non-military field except the majors absorbed into a merge above.
  for (const airport of airports) {
    if (airport.tier !== 'military' && !claimedMajors.has(airport)) result.push(airport)
  }

  return result
}

/**
 * Parse and strictly validate the bundled airport list — the distilled output of
 * `scripts/build-airports.mjs`, not the raw OSM dump. Like the cities and
 * boundary data this is a fixed build-time asset, so anything unexpected is a bug
 * we surface immediately (fail fast) rather than skipping. Co-located military +
 * major pairs are then merged into a single combined field (see
 * `mergeColocatedMilitary`).
 */
export function loadAirports(): Airport[] {
  const parsed: unknown = JSON.parse(raw)

  if (!Array.isArray(parsed) || parsed.length === 0) {
    fail('expected a non-empty array of airports')
  }

  return mergeColocatedMilitary(parsed.map(parseAirport))
}
