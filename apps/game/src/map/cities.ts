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

  return parsed.map((entry, i): City => {
    if (!entry || typeof entry !== 'object') fail(`city ${i} is not an object`)
    const { city, latitude, longitude, population } = entry as Record<string, unknown>

    if (typeof city !== 'string' || city.length === 0) fail(`city ${i} has no name`)
    if (!Number.isFinite(latitude)) fail(`city ${city} has invalid latitude: ${JSON.stringify(latitude)}`)
    if (!Number.isFinite(longitude)) fail(`city ${city} has invalid longitude: ${JSON.stringify(longitude)}`)
    if (!Number.isFinite(population)) fail(`city ${city} has invalid population: ${JSON.stringify(population)}`)

    return {
      name: city,
      lat: latitude as number,
      lon: longitude as number,
      population: population as number,
    }
  })
}
