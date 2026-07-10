import citiesUrl from '../data/major-cities.json?url'

export const CITIES_ASSET = { cacheKey: 'major-cities', url: citiesUrl } as const

export interface City {
  name: string
  lon: number
  lat: number
  population: number
  /** Administrative region the city belongs to, e.g. "Capital Region". */
  region: string
  /** When the city was founded/first settled — a year or century as free text (e.g. "1868", "11th century"). */
  founded: string
  /** Short game-facing description of the city's role and notable character. */
  notes: string
}

function fail(message: string): never {
  throw new Error(`[map/cities] ${message}`)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function requireNonEmptyString(value: unknown, field: string, label: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`city ${label} has no ${field}`)
  return value
}

function parseCity(entry: unknown, index: number): City {
  if (!entry || typeof entry !== 'object') fail(`city ${index} is not an object`)
  const { city, latitude, longitude, population, region, founded, notes } = entry as Record<string, unknown>

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

  return {
    name: city,
    lon: longitude,
    lat: latitude,
    population,
    region: requireNonEmptyString(region, 'region', city),
    founded: requireNonEmptyString(founded, 'founded', city),
    notes: requireNonEmptyString(notes, 'notes', city),
  }
}

export function loadMajorCities(parsed: unknown): City[] {
  if (!Array.isArray(parsed) || parsed.length === 0) {
    fail('expected a non-empty array of cities')
  }

  return parsed.map(parseCity)
}
