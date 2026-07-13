import airportsUrl from '../data/airports.json?url'
import {
  makeFail,
  requireNonEmptyString,
  requireLon,
  requireLat,
  requireOneOf,
  requireNonEmptyArray,
  type Asset,
  type Fail,
} from './validate'

export const AIRPORTS_ASSET: Asset = { cacheKey: 'airports', url: airportsUrl }

export type AirportTier = 'major' | 'minor' | 'military'

const TIERS: readonly AirportTier[] = ['major', 'minor', 'military']

export interface Airport {
  name: string
  lon: number
  lat: number
  tier: AirportTier
}

const fail: Fail = makeFail('map/airports')

function parseAirport(entry: unknown, index: number): Airport {
  if (!entry || typeof entry !== 'object') fail(`airport ${index} is not an object`)
  const { name, lon, lat, tier } = entry as Record<string, unknown>

  const validName = requireNonEmptyString(name, fail, `airport ${index} name`)
  return {
    name: validName,
    lon: requireLon(lon, fail, `airport ${validName}`),
    lat: requireLat(lat, fail, `airport ${validName}`),
    tier: requireOneOf(tier, TIERS, fail, `airport ${validName} tier`),
  }
}

export function loadAirports(parsed: unknown): Airport[] {
  return requireNonEmptyArray(parsed, fail, 'airports').map(parseAirport)
}
