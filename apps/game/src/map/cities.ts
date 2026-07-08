import raw from '../data/major-cities.json?raw'

/** A single labelled place on the map, in lon/lat degrees (WGS84 / CRS84). */
export interface City {
  name: string
  lon: number
  lat: number
  population: number
}

function fail(message: string): never {
  throw new Error(`[map/cities] ${message}`)
}

/** Narrow an unknown value to a finite number, throwing with context otherwise. */
function finiteNumber(value: unknown, context: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${context}: ${JSON.stringify(value)}`)
  }
  return value
}

/** Validate a single raw entry into a `City`, throwing on any structural surprise. */
function parseCity(entry: unknown, index: number): City {
  if (!entry || typeof entry !== 'object') fail(`city ${index} is not an object`)
  const { city, latitude, longitude, population } = entry as Record<string, unknown>

  if (typeof city !== 'string' || city.length === 0) fail(`city ${index} has no name`)

  const lat = finiteNumber(latitude, `city ${city} has invalid latitude`)
  const lon = finiteNumber(longitude, `city ${city} has invalid longitude`)
  const pop = finiteNumber(population, `city ${city} has invalid population`)
  if (lat < -90 || lat > 90) fail(`city ${city} has out-of-range latitude: ${lat}`)
  if (lon < -180 || lon > 180) fail(`city ${city} has out-of-range longitude: ${lon}`)
  if (pop < 0) fail(`city ${city} has negative population: ${pop}`)

  return { name: city, lat, lon, population: pop }
}

/**
 * Parse and strictly validate the bundled major-cities list.
 *
 * Like the boundary data this is a fixed build-time asset, so anything
 * unexpected is a bug we want surfaced immediately rather than silently
 * skipped — every entry must have a name and finite coordinates.
 */
export function loadMajorCities(): City[] {
  const parsed: unknown = JSON.parse(raw)

  if (!Array.isArray(parsed) || parsed.length === 0) {
    fail('expected a non-empty array of cities')
  }

  return parsed.map(parseCity)
}
