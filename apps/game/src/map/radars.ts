import radarsUrl from '../data/radars.json?url'
import {
  makeFail,
  requireNonEmptyString,
  requireLon,
  requireLat,
  requirePositiveNumber,
  requireNullablePositiveNumber,
  requireOneOf,
  requireNonEmptyArray,
  type Asset,
  type Fail,
} from './validate'

export const RADARS_ASSET: Asset = { cacheKey: 'radars', url: radarsUrl }

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

const fail: Fail = makeFail('map/radars')

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

  const validName = requireNonEmptyString(name, fail, `radar ${index} name`)
  return {
    name: validName,
    model: requireNonEmptyString(model, fail, `radar ${validName} model`),
    lon: requireLon(lon, fail, `radar ${validName}`),
    lat: requireLat(lat, fail, `radar ${validName}`),
    rangeKm: requirePositiveNumber(rangeKm, fail, `radar ${validName} rangeKm`),
    updateIntervalSec: requirePositiveNumber(updateIntervalSec, fail, `radar ${validName} updateIntervalSec`),
    manufacturer: requireNonEmptyString(manufacturer, fail, `radar ${validName} manufacturer`),
    origin: requireNonEmptyString(origin, fail, `radar ${validName} origin`),
    type: requireNonEmptyString(type, fail, `radar ${validName} type`),
    dimensionality: requireOneOf(dimensionality, DIMENSIONALITIES, fail, `radar ${validName} dimensionality`),
    band: requireNonEmptyString(band, fail, `radar ${validName} band`),
    altitudeCeilingKm: requireNullablePositiveNumber(altitudeCeilingKm, fail, `radar ${validName} altitudeCeilingKm`),
    notes: requireNonEmptyString(notes, fail, `radar ${validName} notes`),
  }
}

export function loadRadars(parsed: unknown): Radar[] {
  return requireNonEmptyArray(parsed, fail, 'radars').map(parseRadar)
}
