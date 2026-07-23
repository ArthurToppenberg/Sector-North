import { makeFail, requirePositiveNumber } from './validate'

const fail = makeFail('map/aircraftTypes')

export type AircraftTypeId = 'il20m' | 'airliner' | 'turboprop' | 'gaPiston'

export const AIRCRAFT_TYPE_IDS: readonly AircraftTypeId[] = ['il20m', 'airliner', 'turboprop', 'gaPiston']

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
  airliner: {
    typeId: 'airliner',
    name: 'Narrow-body airliner',
    cruiseSpeedKmh: 840,
    // Jets at cruise bank shallow — half standard rate is already generous,
    // and the public-traffic routes are long straight legs anyway.
    turnRateDegPerSec: 1.5,
  },
  turboprop: {
    typeId: 'turboprop',
    name: 'Regional turboprop',
    cruiseSpeedKmh: 500,
    turnRateDegPerSec: 2,
  },
  gaPiston: {
    typeId: 'gaPiston',
    name: 'GA piston single',
    cruiseSpeedKmh: 220,
    // Standard rate — light singles turn far tighter than the heavies above.
    turnRateDegPerSec: 3,
  },
}

for (const typeId of AIRCRAFT_TYPE_IDS) {
  const profile = AIRCRAFT_TYPES[typeId]
  if (profile.typeId !== typeId) {
    fail(`profile keyed ${typeId} carries typeId ${profile.typeId}`)
  }
  requirePositiveNumber(profile.cruiseSpeedKmh, fail, `${typeId} cruiseSpeedKmh`)
  requirePositiveNumber(profile.turnRateDegPerSec, fail, `${typeId} turnRateDegPerSec`)
}
