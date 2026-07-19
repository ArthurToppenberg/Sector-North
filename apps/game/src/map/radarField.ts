import { SIM_TICK_SEC, type Aircraft } from './aircraft'
import { bearingDeg, distanceKm, normalizeDeg } from './geo'
import { makeFail, requireLon, requireLat, requireNonEmptyString, requirePositiveNumber } from './validate'

const fail = makeFail('map/radarField')

export interface RadarSite {
  readonly name: string
  readonly lon: number
  readonly lat: number
  /** Detection range in real kilometres. */
  readonly rangeKm: number
  /** Antenna revolution period in seconds — one full sweep rotation. */
  readonly updateIntervalSec: number
}

/**
 * A snapshot of where a sweep last painted a plane — plain serializable world
 * state, deliberately not a reference to the live aircraft: the contact holds
 * its last-seen position while the plane flies on.
 */
export interface Contact {
  readonly lon: number
  readonly lat: number
  readonly headingDeg: number
  readonly speedKmh: number
}

/**
 * The rotating-antenna sensor field: every site's sweep bearing and the contact
 * picture the sweeps paint. Pure world state — advanced only by `tick` inside
 * the fixed-tick loop (via `AircraftSim.advance`), so the picture is
 * bit-deterministic however frames slice the elapsed time.
 */
export class RadarField {
  private readonly sites: readonly RadarSite[]
  /** Compass bearing (deg) of each site's sweep hand. */
  private readonly bearing: number[]
  private readonly contactList: Contact[] = []

  constructor(sites: readonly RadarSite[]) {
    if (!Array.isArray(sites) || sites.length === 0) fail('expected a non-empty radar site list')
    sites.forEach((s, i) => {
      requireNonEmptyString(s.name, fail, `site ${i} name`)
      requireLon(s.lon, fail, `site ${s.name}`)
      requireLat(s.lat, fail, `site ${s.name}`)
      requirePositiveNumber(s.rangeKm, fail, `site ${s.name} rangeKm`)
      requirePositiveNumber(s.updateIntervalSec, fail, `site ${s.name} updateIntervalSec`)
    })
    this.sites = sites
    // Staggered start: one full turn spread evenly across the sites, so any
    // site is always mid-phase when it becomes the drawn one — never snapping
    // from zero.
    this.bearing = sites.map((_, i) => (i / sites.length) * 360)
  }

  get siteCount(): number {
    return this.sites.length
  }

  get contacts(): readonly Contact[] {
    return this.contactList
  }

  bearingOf(i: number): number {
    if (i < 0 || i >= this.sites.length) fail(`bearingOf index out of range: ${i}`)
    return this.bearing[i]
  }

  /** Degrees site `i`'s hand advances per sim tick — for render-side extrapolation. */
  perTickStepDeg(i: number): number {
    if (i < 0 || i >= this.sites.length) fail(`perTickStepDeg index out of range: ${i}`)
    return (360 * SIM_TICK_SEC) / this.sites[i].updateIntervalSec
  }

  clearContacts(): number {
    const removed = this.contactList.length
    this.contactList.length = 0
    return removed
  }

  /**
   * Advance every sweep by one sim tick, then update the contact picture:
   * first expire every contact whose stored position any hand swept this tick,
   * then paint a fresh snapshot for every aircraft a hand swept — expiry before
   * detection, because a just-detected plane sits inside the swept slice and
   * must survive the tick it was painted on.
   */
  tick(aircraft: readonly Aircraft[]): void {
    const prevBearing = this.bearing.slice()
    const sweptFullTurn: boolean[] = new Array(this.sites.length)
    for (let i = 0; i < this.sites.length; i++) {
      const step = this.perTickStepDeg(i)
      // A period at or below the tick means the whole disc is swept this tick;
      // the wrapped (prev, bearing] arc would carry only the fractional turn.
      sweptFullTurn[i] = step >= 360
      this.bearing[i] = (this.bearing[i] + step) % 360
    }

    const swept = (lon: number, lat: number): boolean => {
      for (let i = 0; i < this.sites.length; i++) {
        const site = this.sites[i]
        if (distanceKm(site.lon, site.lat, lon, lat) > site.rangeKm) continue
        if (sweptFullTurn[i]) return true
        // Half-open arc (prev, bearing]: the closing edge counts, the opening
        // edge does not, so a bearing on a tick boundary is swept exactly once.
        const arcDeg = normalizeDeg(this.bearing[i] - prevBearing[i])
        if (arcDeg === 0) continue
        const offset = normalizeDeg(bearingDeg(site.lon, site.lat, lon, lat) - prevBearing[i])
        if (offset > 0 && offset <= arcDeg) return true
      }
      return false
    }

    let kept = 0
    for (const contact of this.contactList) {
      if (!swept(contact.lon, contact.lat)) this.contactList[kept++] = contact
    }
    this.contactList.length = kept

    for (const ac of aircraft) {
      if (swept(ac.lon, ac.lat)) {
        this.contactList.push({ lon: ac.lon, lat: ac.lat, headingDeg: ac.headingDeg, speedKmh: ac.speedKmh })
      }
    }
  }
}
