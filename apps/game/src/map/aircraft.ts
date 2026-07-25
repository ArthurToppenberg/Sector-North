import { KM_PER_DEG_LAT } from './project'
import { AIRCRAFT_TYPES, type AircraftTypeId } from './aircraftTypes'
import type { Brain } from './brain'
import type { RadarField } from './radarField'
import { isFiniteNumber, makeFail, requireLat, requireLon } from './validate'

export const DEG2RAD = Math.PI / 180
const SECONDS_PER_HOUR = 3600
const fail = makeFail('map/aircraft')

export const SIM_TICK_SEC = 0.125

export interface Aircraft {
  readonly id: number
  readonly type: AircraftTypeId
  lon: number
  lat: number
  /** Compass heading in degrees: 0 = due north, 90 = due east. */
  headingDeg: number
  speedKmh: number
}

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

export interface AircraftSpawn {
  lon: number
  lat: number
  headingDeg: number
  type: AircraftTypeId
}

/**
 * A world-model system the sim invokes at the top of every whole tick, before
 * steering — spawning is tick-quantized like everything else, so injected
 * traffic replays bit-identically however frames slice the elapsed time.
 */
export interface TickSpawner {
  tick(sim: AircraftSim): void
}

export class AircraftSim {
  private readonly aircraft: Aircraft[] = []
  private readonly brains = new Map<number, Brain>()
  private nextId = 1
  /** Real seconds received but not yet consumed by a whole tick. */
  private pendingSec = 0

  constructor(
    private readonly radarField?: RadarField,
    private readonly spawner?: TickSpawner,
  ) {}

  spawn({ lon, lat, headingDeg, type }: AircraftSpawn, brain?: Brain): Aircraft {
    requireLon(lon, fail, 'spawn')
    requireLat(lat, fail, 'spawn')
    if (!isFiniteNumber(headingDeg)) fail(`spawn headingDeg not finite: ${headingDeg}`)
    const profile = AIRCRAFT_TYPES[type]
    if (profile === undefined) fail(`spawn type unknown: ${JSON.stringify(type)}`)

    const ac: Aircraft = { id: this.nextId++, type, lon, lat, headingDeg, speedKmh: profile.cruiseSpeedKmh }
    this.aircraft.push(ac)
    if (brain !== undefined) this.brains.set(ac.id, brain)
    return ac
  }

  /** Returns the number of whole ticks stepped, so callers can observe the real tick rate. */
  advance(deltaSec: number): number {
    if (!Number.isFinite(deltaSec) || deltaSec < 0) fail(`deltaSec must be finite and >= 0, got ${deltaSec}`)
    this.pendingSec += deltaSec
    let ticks = 0
    while (this.pendingSec >= SIM_TICK_SEC) {
      this.spawner?.tick(this)
      // Steer, then step: the brain sets the heading the whole tick is flown
      // on. Steering inside the whole-tick loop is what keeps turning
      // deterministic — the turn is rate-limited per fixed tick, so the same
      // tick count yields the same heading sequence however frames sliced it.
      for (const ac of this.aircraft) {
        this.brains.get(ac.id)?.tick(ac, SIM_TICK_SEC)
        stepAircraft(ac, SIM_TICK_SEC)
      }
      // Cull finished flights before the radar looks: a landed or departed
      // aircraft must not paint a contact on the tick it disappears.
      for (let i = this.aircraft.length - 1; i >= 0; i--) {
        const ac = this.aircraft[i]
        if (this.brains.get(ac.id)?.done === true) {
          this.brains.delete(ac.id)
          this.aircraft.splice(i, 1)
        }
      }
      // Spawn → steer → step → cull → radar is the determinism contract:
      // detection sees each tick's true positions, so the contact picture is
      // bit-identical however frames slice the elapsed time.
      this.radarField?.tick(this.aircraft)
      this.pendingSec -= SIM_TICK_SEC
      ticks++
    }
    return ticks
  }

  /**
   * How far through the next tick the banked time has come, in [0, 1).
   * Presentation only — the renderer may extrapolate the sweep hand between
   * ticks with it; world state never reads it.
   */
  get pendingTickFraction(): number {
    return this.pendingSec / SIM_TICK_SEC
  }

  brainOf(id: number): Brain | undefined {
    return this.brains.get(id)
  }

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
