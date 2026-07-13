import citiesUrl from '../data/major-cities.json?url'
import {
  makeFail,
  isFiniteNumber,
  requireNonEmptyString,
  requireLon,
  requireLat,
  requireNonEmptyArray,
  type Asset,
  type Fail,
} from './validate'

export const CITIES_ASSET: Asset = { cacheKey: 'major-cities', url: citiesUrl }

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

const fail: Fail = makeFail('map/cities')

function parseCity(entry: unknown, index: number): City {
  if (!entry || typeof entry !== 'object') fail(`city ${index} is not an object`)
  const { city, latitude, longitude, population, region, founded, notes } = entry as Record<string, unknown>

  const name = requireNonEmptyString(city, fail, `city ${index} name`)
  if (!isFiniteNumber(population) || population < 0) {
    fail(`city ${name} has invalid population: ${JSON.stringify(population)}`)
  }

  return {
    name,
    lon: requireLon(longitude, fail, `city ${name}`),
    lat: requireLat(latitude, fail, `city ${name}`),
    population,
    region: requireNonEmptyString(region, fail, `city ${name} region`),
    founded: requireNonEmptyString(founded, fail, `city ${name} founded`),
    notes: requireNonEmptyString(notes, fail, `city ${name} notes`),
  }
}

export function loadMajorCities(parsed: unknown): City[] {
  return requireNonEmptyArray(parsed, fail, 'cities').map(parseCity)
}
