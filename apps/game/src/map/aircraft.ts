import { KM_PER_DEG_LAT } from './project'
import { AIRCRAFT_TYPES, type AircraftTypeId } from './aircraftTypes'
import type { Brain } from './brain'

const DEG2RAD = Math.PI / 180
const SECONDS_PER_HOUR = 3600

/**
 * The canonical simulation tick (seconds). Sim time only ever advances in whole
 * ticks (see `AircraftSim.advance`): `stepAircraft`'s integration is
 * step-size-sensitive (it uses the start latitude's cosine for the whole step),
 * so stepping 10 s as one step vs. 100 small ones lands in different places —
 * only a fixed tick makes replay and pause/fast-forward bit-stable, and lets the
 * same world run headless on a server (the determinism core principle, see root
 * CLAUDE.md). 0.125 is exactly representable in binary floating point, so
 * whole-second durations quantize into an exact tick count with zero remainder;
 * 8 Hz is ample for km-scale movement (800 km/h ≈ 28 m per tick).
 */
export const SIM_TICK_SEC = 0.125

/**
 * A simulated aircraft. Its position is a real GPS coordinate (WGS84) — the
 * source of truth — advanced in lon/lat by `stepAircraft`; where it is *drawn*
 * is derived from this via the projection layer, never stored here.
 */
export interface Aircraft {
  readonly id: number
  readonly type: AircraftTypeId
  lon: number
  lat: number
  /** Compass heading in degrees: 0 = due north, 90 = due east. */
  headingDeg: number
  speedKmh: number
}

function fail(message: string): never {
  throw new Error(`[map/aircraft] ${message}`)
}

/**
 * Advance one aircraft by `deltaSec` real seconds along its current heading,
 * mutating its lon/lat in place. The step is done in geographic units, not
 * pixels (GPS is the source of truth): a north/south component maps straight
 * through `KM_PER_DEG_LAT`, while the east/west component is divided by
 * `cos(latitude)` because a degree of longitude narrows toward the poles — the
 * same latitude correction the projection layer applies.
 */
export function stepAircraft(ac: Aircraft, deltaSec: number): void {
  if (!Number.isFinite(deltaSec) || deltaSec < 0) fail(`deltaSec must be finite and >= 0, got ${deltaSec}`)
  const distKm = ac.speedKmh * (deltaSec / SECONDS_PER_HOUR)
  if (distKm === 0) return

  const headingRad = ac.headingDeg * DEG2RAD
  const cosLat = Math.cos(ac.lat * DEG2RAD)
  // A near-zero cosine means the aircraft has wandered to a pole, where the
  // lon/lat step degenerates — surface it rather than divide by ~0 into a wild
  // longitude jump. Never reachable in this game's latitudes, but a real bug if it is.
  if (Math.abs(cosLat) < 1e-6) fail(`aircraft ${ac.id} at lat ${ac.lat} is too near a pole to step in lon/lat`)

  ac.lat += (distKm * Math.cos(headingRad)) / KM_PER_DEG_LAT
  ac.lon += (distKm * Math.sin(headingRad)) / (KM_PER_DEG_LAT * cosLat)
}

/**
 * Parameters for spawning one aircraft; validated by `AircraftSim.spawn`.
 * Speed is not a parameter — it is derived from the type's profile, so the
 * profile stays the single source of truth for how fast a type flies.
 */
export interface AircraftSpawn {
  lon: number
  lat: number
  headingDeg: number
  type: AircraftTypeId
}

/**
 * Owns the set of in-flight aircraft and advances them each tick. Pure world
 * model — no Phaser, no projection knowledge — so the render side observes it
 * through the projection layer rather than the sim reasoning about pixels.
 */
export class AircraftSim {
  private readonly aircraft: Aircraft[] = []
  /**
   * Brains are keyed by aircraft id rather than stored on the `Aircraft`
   * struct, so world state stays plain data — serializable/replayable later
   * without behavior objects tangled into it. A brainless aircraft simply
   * flies straight forever.
   */
  private readonly brains = new Map<number, Brain>()
  private nextId = 1
  /** Real seconds received but not yet consumed by a whole tick. */
  private pendingSec = 0

  spawn({ lon, lat, headingDeg, type }: AircraftSpawn, brain?: Brain): Aircraft {
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) fail(`spawn lon out of range: ${lon}`)
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) fail(`spawn lat out of range: ${lat}`)
    if (!Number.isFinite(headingDeg)) fail(`spawn headingDeg not finite: ${headingDeg}`)
    const profile = AIRCRAFT_TYPES[type]
    if (profile === undefined) fail(`spawn type unknown: ${JSON.stringify(type)}`)

    const ac: Aircraft = { id: this.nextId++, type, lon, lat, headingDeg, speedKmh: profile.cruiseSpeedKmh }
    this.aircraft.push(ac)
    if (brain !== undefined) this.brains.set(ac.id, brain)
    return ac
  }

  /**
   * Advance the sim by real elapsed seconds. The world only ever steps in whole
   * `SIM_TICK_SEC` ticks — the sub-tick remainder is banked for the next call —
   * so identical elapsed time yields identical tick sequences regardless of how
   * the caller's frames slice it up. A long delta (a paused tab catching up) is
   * simply many ticks replayed in a burst: that is the fast-forward mechanism,
   * not a special case.
   */
  advance(deltaSec: number): void {
    if (!Number.isFinite(deltaSec) || deltaSec < 0) fail(`deltaSec must be finite and >= 0, got ${deltaSec}`)
    this.pendingSec += deltaSec
    while (this.pendingSec >= SIM_TICK_SEC) {
      // Steer, then step: the brain sets the heading the whole tick is flown
      // on. Steering inside the whole-tick loop is what keeps turning
      // deterministic — the turn is rate-limited per fixed tick, so the same
      // tick count yields the same heading sequence however frames sliced it.
      for (const ac of this.aircraft) {
        this.brains.get(ac.id)?.tick(ac, SIM_TICK_SEC)
        stepAircraft(ac, SIM_TICK_SEC)
      }
      this.pendingSec -= SIM_TICK_SEC
    }
  }

  /** The brain steering the given aircraft, or undefined if it flies brainless. */
  brainOf(id: number): Brain | undefined {
    return this.brains.get(id)
  }

  /** Remove every aircraft; returns how many were removed. */
  clear(): number {
    const removed = this.aircraft.length
    this.aircraft.length = 0
    this.brains.clear()
    return removed
  }

  get count(): number {
    return this.aircraft.length
  }

  get all(): readonly Aircraft[] {
    return this.aircraft
  }
}
