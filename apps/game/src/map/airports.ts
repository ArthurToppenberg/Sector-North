import airportsUrl from '../data/airports.json?url'

export const AIRPORTS_ASSET = { cacheKey: 'airports', url: airportsUrl } as const

export type AirportTier = 'major' | 'minor' | 'military'

const TIERS: ReadonlySet<AirportTier> = new Set(['major', 'minor', 'military'])

const AXIS_BOUND = { lon: 180, lat: 90 } as const
type Axis = keyof typeof AXIS_BOUND

export interface Airport {
  name: string
  lon: number
  lat: number
  tier: AirportTier
}

function fail(message: string): never {
  throw new Error(`[map/airports] ${message}`)
}

function requireNonEmptyString(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${subject} is missing or empty`)
  return value
}

function requireCoordinate(value: unknown, axis: Axis, subject: string): number {
  const bound = AXIS_BOUND[axis]
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -bound || value > bound) {
    fail(`${subject} has out-of-range ${axis}: ${JSON.stringify(value)}`)
  }
  return value
}

function requireTier(value: unknown, subject: string): AirportTier {
  if (typeof value !== 'string' || !TIERS.has(value as AirportTier)) {
    fail(`${subject} has invalid tier: ${JSON.stringify(value)}`)
  }
  return value as AirportTier
}

function parseAirport(entry: unknown, index: number): Airport {
  if (!entry || typeof entry !== 'object') fail(`airport ${index} is not an object`)
  const { name, lon, lat, tier } = entry as Record<string, unknown>

  const validName = requireNonEmptyString(name, `airport ${index} name`)
  return {
    name: validName,
    lon: requireCoordinate(lon, 'lon', `airport ${validName}`),
    lat: requireCoordinate(lat, 'lat', `airport ${validName}`),
    tier: requireTier(tier, `airport ${validName}`),
  }
}

export function loadAirports(parsed: unknown): Airport[] {
  if (!Array.isArray(parsed) || parsed.length === 0) {
    fail('expected a non-empty array of airports')
  }

  return parsed.map(parseAirport)
}
