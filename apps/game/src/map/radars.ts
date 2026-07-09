import radarsUrl from '../data/radars.json?url'

export const RADARS_ASSET = { cacheKey: 'radars', url: radarsUrl } as const

export type RadarDimensionality = '2D' | '3D'

export interface Radar {
  name: string
  model: string
  lon: number
  lat: number
  /** Detection/instrumented range in real kilometres — the sweep hand's length. */
  rangeKm: number
  /** Antenna sweep period in seconds (time between updates on a given bearing). */
  updateIntervalSec: number
  /** Who built it and where. */
  manufacturer: string
  origin: string
  /** Human-readable classification, e.g. "3D long-range air surveillance radar". */
  type: string
  /** Whether the radar measures altitude ('3D') or only range+azimuth ('2D'). */
  dimensionality: RadarDimensionality
  /** IEEE frequency band letter, e.g. "L" or "S". */
  band: string
  /**
   * Altitude coverage ceiling in real kilometres, or null when the sensor does
   * not measure/publish one (e.g. a 2D primary surveillance radar). Null is an
   * honest "not applicable", never a masked missing value.
   */
  altitudeCeilingKm: number | null
  /** Short game-facing description of role and notable capabilities. */
  notes: string
}

const DIMENSIONALITIES: readonly RadarDimensionality[] = ['2D', '3D']

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

function requirePositiveNumber(value: unknown, field: string, label: string): number {
  if (!isFiniteNumber(value) || value <= 0) {
    fail(`radar ${label} has non-positive ${field}: ${JSON.stringify(value)}`)
  }
  return value
}

/** Null is a valid, explicit "no ceiling published"; any present value must be positive. */
function requireNullablePositiveNumber(
  value: unknown,
  field: string,
  label: string,
): number | null {
  if (value === null) return null
  return requirePositiveNumber(value, field, label)
}

function requireDimensionality(value: unknown, label: string): RadarDimensionality {
  if (value !== '2D' && value !== '3D') {
    fail(`radar ${label} has invalid dimensionality (want ${DIMENSIONALITIES.join('/')}): ${JSON.stringify(value)}`)
  }
  return value
}

function parseRadar(entry: unknown, index: number): Radar {
  if (!entry || typeof entry !== 'object') fail(`radar ${index} is not an object`)
  const {
    name,
    model,
    lon,
    lat,
    rangeKm,
    updateIntervalSec,
    manufacturer,
    origin,
    type,
    dimensionality,
    band,
    altitudeCeilingKm,
    notes,
  } = entry as Record<string, unknown>

  const validName = requireNonEmptyString(name, 'name', String(index))
  return {
    name: validName,
    model: requireNonEmptyString(model, 'model', validName),
    lon: requireCoordinate(lon, 'lon', LON_RANGE, validName),
    lat: requireCoordinate(lat, 'lat', LAT_RANGE, validName),
    rangeKm: requirePositiveNumber(rangeKm, 'rangeKm', validName),
    updateIntervalSec: requirePositiveNumber(updateIntervalSec, 'updateIntervalSec', validName),
    manufacturer: requireNonEmptyString(manufacturer, 'manufacturer', validName),
    origin: requireNonEmptyString(origin, 'origin', validName),
    type: requireNonEmptyString(type, 'type', validName),
    dimensionality: requireDimensionality(dimensionality, validName),
    band: requireNonEmptyString(band, 'band', validName),
    altitudeCeilingKm: requireNullablePositiveNumber(altitudeCeilingKm, 'altitudeCeilingKm', validName),
    notes: requireNonEmptyString(notes, 'notes', validName),
  }
}

export function loadRadars(parsed: unknown): Radar[] {
  if (!Array.isArray(parsed) || parsed.length === 0) {
    fail('expected a non-empty array of radars')
  }

  return parsed.map(parseRadar)
}
