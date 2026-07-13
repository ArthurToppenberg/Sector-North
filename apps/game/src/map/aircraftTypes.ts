import { makeFail, requirePositiveNumber } from './validate'

const fail = makeFail('map/aircraftTypes')

export type AircraftTypeId = 'il20m'

export const AIRCRAFT_TYPE_IDS: readonly AircraftTypeId[] = ['il20m']

/**
 * Real-world performance profile for one aircraft type. All values are real
 * units (km/h, deg/s), never pixels — GPS is the source of truth, and the sim
 * must be able to run headless (root CLAUDE.md).
 */
export interface AircraftTypeProfile {
  readonly typeId: AircraftTypeId
  readonly name: string
  readonly cruiseSpeedKmh: number
  readonly turnRateDegPerSec: number
}

export const AIRCRAFT_TYPES: Readonly<Record<AircraftTypeId, AircraftTypeProfile>> = {
  il20m: {
    typeId: 'il20m',
    name: 'Il-20M "Coot"',
    cruiseSpeedKmh: 610,
    // A gentle heavy-turboprop cruise turn (about half standard rate) — the
    // Il-20M probes in long straight legs, it doesn't dogfight.
    turnRateDegPerSec: 1.5,
  },
}

// The profiles are authored TS, not loaded data, so a cheap module-load sanity
// pass replaces a full loader: a typo'd number here would otherwise surface as
// silently wrong movement instead of an error.
for (const typeId of AIRCRAFT_TYPE_IDS) {
  const profile = AIRCRAFT_TYPES[typeId]
  if (profile.typeId !== typeId) {
    fail(`profile keyed ${typeId} carries typeId ${profile.typeId}`)
  }
  requirePositiveNumber(profile.cruiseSpeedKmh, fail, `${typeId} cruiseSpeedKmh`)
  requirePositiveNumber(profile.turnRateDegPerSec, fail, `${typeId} turnRateDegPerSec`)
}
