import raw from '../data/radars.json?raw'

/**
 * A single air-defence radar site in lon/lat degrees (WGS84 / CRS84), carrying
 * the sensor model installed there. Like the cities and airfields this is a
 * fixed, hand-curated build-time asset — a handful of Danish/Faroese long-range
 * radar sites, not a generated dump.
 */
export interface Radar {
  name: string
  /** The radar hardware installed at the site, e.g. "Lockheed Martin TPS-77". */
  model: string
  lon: number
  lat: number
}

function fail(message: string): never {
  throw new Error(`[map/radars] ${message}`)
}

/** True only for real, finite numbers — rejects strings, NaN, and ±Infinity while narrowing. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Validate one entry from the bundled list and return a typed `Radar`, or throw.
 * Every branch narrows the field so the returned object needs no casts.
 */
function parseRadar(entry: unknown, index: number): Radar {
  if (!entry || typeof entry !== 'object') fail(`radar ${index} is not an object`)
  const { name, model, lon, lat } = entry as Record<string, unknown>

  if (typeof name !== 'string' || name.length === 0) fail(`radar ${index} has no name`)
  if (typeof model !== 'string' || model.length === 0) fail(`radar ${name} has no model`)
  if (!isFiniteNumber(lon) || lon < -180 || lon > 180) {
    fail(`radar ${name} has out-of-range lon: ${JSON.stringify(lon)}`)
  }
  if (!isFiniteNumber(lat) || lat < -90 || lat > 90) {
    fail(`radar ${name} has out-of-range lat: ${JSON.stringify(lat)}`)
  }

  return { name, model, lon, lat }
}

/**
 * Parse and strictly validate the bundled radar list. Like the cities, airfields
 * and boundary data this is a fixed build-time asset, so anything unexpected is a
 * bug we surface immediately (fail fast) rather than skipping.
 */
export function loadRadars(): Radar[] {
  const parsed: unknown = JSON.parse(raw)

  if (!Array.isArray(parsed) || parsed.length === 0) {
    fail('expected a non-empty array of radars')
  }

  return parsed.map(parseRadar)
}
