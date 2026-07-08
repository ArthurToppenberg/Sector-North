import raw from '../data/radars.json?raw'

export interface Radar {
  name: string
  model: string
  lon: number
  lat: number
}

const LON_RANGE = { min: -180, max: 180 } as const
const LAT_RANGE = { min: -90, max: 90 } as const

function fail(message: string): never {
  throw new Error(`[map/radars] ${message}`)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function requireNonEmptyString(value: unknown, field: string, label: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`radar ${label} has no ${field}`)
  return value
}

function requireCoordinate(
  value: unknown,
  axis: string,
  range: { min: number; max: number },
  label: string,
): number {
  if (!isFiniteNumber(value) || value < range.min || value > range.max) {
    fail(`radar ${label} has out-of-range ${axis}: ${JSON.stringify(value)}`)
  }
  return value
}

/**
 * Every branch narrows the field so the returned object needs no casts.
 */
function parseRadar(entry: unknown, index: number): Radar {
  if (!entry || typeof entry !== 'object') fail(`radar ${index} is not an object`)
  const { name, model, lon, lat } = entry as Record<string, unknown>

  const validName = requireNonEmptyString(name, 'name', String(index))
  return {
    name: validName,
    model: requireNonEmptyString(model, 'model', validName),
    lon: requireCoordinate(lon, 'lon', LON_RANGE, validName),
    lat: requireCoordinate(lat, 'lat', LAT_RANGE, validName),
  }
}

export function loadRadars(): Radar[] {
  const parsed: unknown = JSON.parse(raw)

  if (!Array.isArray(parsed) || parsed.length === 0) {
    fail('expected a non-empty array of radars')
  }

  return parsed.map(parseRadar)
}
