import citiesUrl from '../data/major-cities.json?url'

export const CITIES_ASSET = { cacheKey: 'major-cities', url: citiesUrl } as const

export interface City {
  name: string
  lon: number
  lat: number
  population: number
}

function fail(message: string): never {
  throw new Error(`[map/cities] ${message}`)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseCity(entry: unknown, index: number): City {
  if (!entry || typeof entry !== 'object') fail(`city ${index} is not an object`)
  const { city, latitude, longitude, population } = entry as Record<string, unknown>

  if (typeof city !== 'string' || city.length === 0) fail(`city ${index} has no name`)
  if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) {
    fail(`city ${city} has out-of-range longitude: ${JSON.stringify(longitude)}`)
  }
  if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) {
    fail(`city ${city} has out-of-range latitude: ${JSON.stringify(latitude)}`)
  }
  if (!isFiniteNumber(population) || population < 0) {
    fail(`city ${city} has invalid population: ${JSON.stringify(population)}`)
  }

  return { name: city, lon: longitude, lat: latitude, population }
}

export function loadMajorCities(parsed: unknown): City[] {
  if (!Array.isArray(parsed) || parsed.length === 0) {
    fail('expected a non-empty array of cities')
  }

  return parsed.map(parseCity)
}
