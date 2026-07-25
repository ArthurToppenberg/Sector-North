import { AIRCRAFT_TYPE_IDS, type AircraftTypeId } from './aircraftTypes'
import type { Waypoint } from './brain'
import {
  makeFail,
  requireLat,
  requireLon,
  requireNonEmptyString,
  requireOneOf,
  requirePositiveNumber,
  type Fail,
} from './validate'

const fail = makeFail('map/trafficPatterns')

/**
 * A gate: a lon/lat segment a flight crosses at a PRNG-jittered point — the
 * sim-boundary slice of a real traffic flow, wide because real flights spread
 * across an airway's width rather than threading one fix.
 */
export interface Gate {
  readonly a: Waypoint
  readonly b: Waypoint
}

export type RouteAnchor =
  | { readonly kind: 'point'; readonly lon: number; readonly lat: number }
  | { readonly kind: 'gate'; readonly gate: Gate }
  | { readonly kind: 'airport'; readonly name: string }

/**
 * A scheduled point-to-point flow: overflight (gate → gate), arrival
 * (gate → airport), departure (airport → gate) or domestic (airport →
 * airport). The first anchor is the spawn point; the rest are flown as
 * waypoints, and the aircraft despawns at the last one (landed / left the
 * sector).
 */
export interface FlowPattern {
  readonly kind: 'flow'
  readonly name: string
  readonly type: AircraftTypeId
  readonly ratePerHour: number
  readonly route: readonly RouteAnchor[]
}

/**
 * Local hobby flying: spawn at a field, wander a PRNG-rolled circuit of
 * radial waypoints around it, return to the field and despawn.
 */
export interface LocalPattern {
  readonly kind: 'local'
  readonly name: string
  readonly type: AircraftTypeId
  readonly ratePerHour: number
  readonly airportName: string
  readonly legKm: { readonly min: number; readonly max: number }
  readonly legCount: { readonly min: number; readonly max: number }
}

export type TrafficPattern = FlowPattern | LocalPattern

function gate(g: Gate): RouteAnchor {
  return { kind: 'gate', gate: g }
}

function airport(name: string): RouteAnchor {
  return { kind: 'airport', name }
}

// The boundary gates of the phase-1 flows. Placed on the map's fringes so
// flights enter/leave off-stage rather than materialising over Denmark.
const NORTH_SEA_GATE: Gate = { a: { lon: 5.8, lat: 55.2 }, b: { lon: 5.8, lat: 57.3 } }
const BALTIC_GATE: Gate = { a: { lon: 16.8, lat: 54.9 }, b: { lon: 16.8, lat: 56.2 } }
const SKAGERRAK_GATE: Gate = { a: { lon: 7.6, lat: 58.3 }, b: { lon: 10.4, lat: 58.3 } }
const GERMANY_GATE: Gate = { a: { lon: 8.4, lat: 54.2 }, b: { lon: 10.4, lat: 54.2 } }
const ARKONA_GATE: Gate = { a: { lon: 12.6, lat: 54.3 }, b: { lon: 14.4, lat: 54.3 } }

/**
 * Rates are calibrated against published statistics, scaled to the subset of
 * flows encoded so far: København FIR handled ~559k IFR movements in 2023
 * (~62/hour average, roughly half of it overflights — Copenhagen Airport
 * alone flew 240,680 movements in 2024, ~27/hour of arrivals plus departures,
 * so airport-linked traffic claims the other half). This phase-1 set totals
 * ~53/hour and settles around ~30 concurrent aircraft — real average density,
 * before time-of-day curves.
 */
export const TRAFFIC_PATTERNS: readonly TrafficPattern[] = [
  // East–west trunk: UK/North Sea ↔ Stockholm/Finland/Baltics.
  { kind: 'flow', name: 'overflight-eastbound', type: 'airliner', ratePerHour: 8, route: [gate(NORTH_SEA_GATE), gate(BALTIC_GATE)] },
  { kind: 'flow', name: 'overflight-westbound', type: 'airliner', ratePerHour: 8, route: [gate(BALTIC_GATE), gate(NORTH_SEA_GATE)] },
  // North–south trunk: Oslo/Skagerrak ↔ continental Europe over Jutland.
  { kind: 'flow', name: 'overflight-southbound', type: 'airliner', ratePerHour: 6, route: [gate(SKAGERRAK_GATE), gate(GERMANY_GATE)] },
  { kind: 'flow', name: 'overflight-northbound', type: 'airliner', ratePerHour: 6, route: [gate(GERMANY_GATE), gate(SKAGERRAK_GATE)] },
  // Copenhagen flows. Continental arrivals funnel over the Arkona Basin and
  // turn north up the Øresund rather than cutting straight across Møn.
  { kind: 'flow', name: 'cph-arrival-west', type: 'airliner', ratePerHour: 5, route: [gate(NORTH_SEA_GATE), airport('Københavns Lufthavn')] },
  { kind: 'flow', name: 'cph-arrival-south', type: 'airliner', ratePerHour: 5, route: [gate(ARKONA_GATE), { kind: 'point', lon: 12.9, lat: 54.95 }, airport('Københavns Lufthavn')] },
  { kind: 'flow', name: 'cph-departure-west', type: 'airliner', ratePerHour: 5, route: [airport('Københavns Lufthavn'), gate(NORTH_SEA_GATE)] },
  { kind: 'flow', name: 'cph-departure-east', type: 'airliner', ratePerHour: 5, route: [airport('Københavns Lufthavn'), gate(BALTIC_GATE)] },
  // The main domestic trunk.
  { kind: 'flow', name: 'domestic-cph-aalborg', type: 'turboprop', ratePerHour: 1, route: [airport('Københavns Lufthavn'), airport('Aalborg Lufthavn')] },
  { kind: 'flow', name: 'domestic-aalborg-cph', type: 'turboprop', ratePerHour: 1, route: [airport('Aalborg Lufthavn'), airport('Københavns Lufthavn')] },
  // Local hobby circuits, one field per region for spread.
  { kind: 'local', name: 'ga-ringsted', type: 'gaPiston', ratePerHour: 1, airportName: 'Ringsted Flyveplads', legKm: { min: 10, max: 35 }, legCount: { min: 2, max: 4 } },
  { kind: 'local', name: 'ga-randers', type: 'gaPiston', ratePerHour: 1, airportName: 'Randers Flyveplads', legKm: { min: 10, max: 35 }, legCount: { min: 2, max: 4 } },
  { kind: 'local', name: 'ga-herning', type: 'gaPiston', ratePerHour: 1, airportName: 'Herning Flyveplads', legKm: { min: 10, max: 35 }, legCount: { min: 2, max: 4 } },
]

function validateAnchor(anchor: RouteAnchor, f: Fail, subject: string): void {
  if (anchor.kind === 'point') {
    requireLon(anchor.lon, f, subject)
    requireLat(anchor.lat, f, subject)
    return
  }
  if (anchor.kind === 'gate') {
    for (const end of [anchor.gate.a, anchor.gate.b]) {
      requireLon(end.lon, f, subject)
      requireLat(end.lat, f, subject)
    }
    return
  }
  requireNonEmptyString(anchor.name, f, `${subject} airport name`)
}

// Authored-TS sanity check (the aircraftTypes.ts / routes.ts convention): the
// literal above is validated at module load so a typo'd number throws at
// import, not as silently wrong traffic hours into a session.
{
  const seen = new Set<string>()
  for (const p of TRAFFIC_PATTERNS) {
    requireNonEmptyString(p.name, fail, 'pattern name')
    if (seen.has(p.name)) fail(`duplicate pattern name ${JSON.stringify(p.name)}`)
    seen.add(p.name)
    requirePositiveNumber(p.ratePerHour, fail, `${p.name} ratePerHour`)
    requireOneOf(p.type, AIRCRAFT_TYPE_IDS, fail, `${p.name} type`)
    if (p.kind === 'flow') {
      if (p.route.length < 2) fail(`${p.name} needs a spawn anchor plus at least one waypoint`)
      p.route.forEach((anchor, i) => validateAnchor(anchor, fail, `${p.name} anchor ${i}`))
    } else {
      requireNonEmptyString(p.airportName, fail, `${p.name} airportName`)
      requirePositiveNumber(p.legKm.min, fail, `${p.name} legKm.min`)
      if (!Number.isFinite(p.legKm.max) || p.legKm.max < p.legKm.min) {
        fail(`${p.name} legKm.max must be >= legKm.min`)
      }
      if (!Number.isInteger(p.legCount.min) || p.legCount.min < 1) {
        fail(`${p.name} legCount.min must be an integer >= 1`)
      }
      if (!Number.isInteger(p.legCount.max) || p.legCount.max < p.legCount.min) {
        fail(`${p.name} legCount.max must be an integer >= legCount.min`)
      }
    }
  }
}
