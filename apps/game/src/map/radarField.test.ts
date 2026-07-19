import { describe, it, expect } from 'vitest'
import { RadarField, type RadarSite } from './radarField'
import { AircraftSim, SIM_TICK_SEC, type Aircraft } from './aircraft'

function site(overrides: Partial<RadarSite> = {}): RadarSite {
  return { name: 'Alpha', lon: 12, lat: 55, rangeKm: 100, updateIntervalSec: 0.5, ...overrides }
}

function plane(lon: number, lat: number, overrides: Partial<Aircraft> = {}): Aircraft {
  return { id: 1, type: 'il20m', lon, lat, headingDeg: 45, speedKmh: 600, ...overrides }
}

// updateIntervalSec 0.5 → 90° per tick: cardinal bearings from (12, 55) are
// exact in floating point (bearingDeg(12,55,13,55) === 90), so arc-edge cases
// can be asserted bit-exactly.
const QUARTER_TURN_SITE = site({ updateIntervalSec: 0.5 })
const EAST = plane(13, 55)
const SOUTH = plane(12, 54.5)

describe('RadarField construction', () => {
  it('staggers the initial bearings one full turn spread evenly across the sites', () => {
    const field = new RadarField([
      site({ name: 'A' }),
      site({ name: 'B' }),
      site({ name: 'C' }),
      site({ name: 'D' }),
    ])
    expect([0, 1, 2, 3].map((i) => field.bearingOf(i))).toEqual([0, 90, 180, 270])
    expect(field.siteCount).toBe(4)
  })

  it('rejects an empty site list and invalid site fields', () => {
    expect(() => new RadarField([])).toThrow(/non-empty radar site list/)
    expect(() => new RadarField([site({ name: '' })])).toThrow(/missing or empty/)
    expect(() => new RadarField([site({ lon: 181 })])).toThrow(/out-of-range longitude/)
    expect(() => new RadarField([site({ lat: -91 })])).toThrow(/out-of-range latitude/)
    expect(() => new RadarField([site({ rangeKm: 0 })])).toThrow(/non-positive/)
    expect(() => new RadarField([site({ updateIntervalSec: -1 })])).toThrow(/non-positive/)
  })

  it('rejects an out-of-range site index', () => {
    const field = new RadarField([site()])
    expect(() => field.bearingOf(1)).toThrow(/out of range/)
    expect(() => field.perTickStepDeg(-1)).toThrow(/out of range/)
  })
})

describe('RadarField rotation', () => {
  it('advances each hand by 360 × SIM_TICK_SEC / updateIntervalSec per tick, wrapping at 360', () => {
    const field = new RadarField([site({ name: 'A', updateIntervalSec: 0.5 }), site({ name: 'B', updateIntervalSec: 1 })])
    expect(field.perTickStepDeg(0)).toBe(90)
    expect(field.perTickStepDeg(1)).toBe(45)
    field.tick([])
    expect(field.bearingOf(0)).toBe(90)
    expect(field.bearingOf(1)).toBe(225)
    field.tick([])
    field.tick([])
    field.tick([])
    expect(field.bearingOf(0)).toBe(0)
    expect(field.bearingOf(1)).toBe(0)
  })
})

describe('RadarField detection', () => {
  it('paints a snapshot contact for a plane inside the swept arc and range', () => {
    const field = new RadarField([QUARTER_TURN_SITE])
    const p = plane(13, 55, { headingDeg: 10, speedKmh: 640 })
    field.tick([p])
    expect(field.contacts).toEqual([{ lon: 13, lat: 55, headingDeg: 10, speedKmh: 640 }])

    // A contact is a snapshot, not a live reference: the plane flying on must
    // not drag the painted position with it.
    p.lon = 13.5
    expect(field.contacts[0].lon).toBe(13)
  })

  it('does not paint a plane the hand has not reached yet', () => {
    const field = new RadarField([QUARTER_TURN_SITE])
    field.tick([SOUTH])
    expect(field.contacts).toHaveLength(0)
    field.tick([SOUTH])
    expect(field.contacts).toHaveLength(1)
  })

  it('never paints a plane beyond the site range', () => {
    const field = new RadarField([site({ updateIntervalSec: SIM_TICK_SEC })])
    const farNorth = plane(12, 56.5)
    for (let i = 0; i < 10; i++) field.tick([farNorth])
    expect(field.contacts).toHaveLength(0)
  })

  it('expires a contact when the sweep revisits its position, repainting only a plane still there', () => {
    const field = new RadarField([QUARTER_TURN_SITE])
    const p = plane(13, 55)
    field.tick([p])
    expect(field.contacts).toHaveLength(1)

    p.lon = 12
    p.lat = 54.5
    field.tick([p])
    // The old contact holds its last-seen spot while the plane is painted anew.
    expect(field.contacts.map((c) => [c.lon, c.lat])).toEqual([
      [13, 55],
      [12, 54.5],
    ])

    field.tick([p])
    field.tick([p])
    expect(field.contacts).toHaveLength(2)

    // Next revolution: the eastern slice is swept again, the plane is gone
    // from it, so the stale contact vanishes without a replacement.
    field.tick([p])
    expect(field.contacts.map((c) => [c.lon, c.lat])).toEqual([[12, 54.5]])

    // The southern slice repaints the plane still sitting there: expire + paint
    // in the same tick nets one contact, not zero and not two.
    field.tick([p])
    expect(field.contacts.map((c) => [c.lon, c.lat])).toEqual([[12, 54.5]])
  })

  it('sweeps a bearing exactly on the closing edge exactly once', () => {
    const field = new RadarField([QUARTER_TURN_SITE])
    field.tick([EAST])
    expect(field.contacts).toHaveLength(1)
    // Next tick's arc opens at the previous closing edge, which is excluded:
    // the contact is neither expired nor painted a second time.
    field.tick([EAST])
    expect(field.contacts).toHaveLength(1)
  })

  it('paints one contact per plane under overlapping coverage', () => {
    const field = new RadarField([
      site({ name: 'A', updateIntervalSec: SIM_TICK_SEC }),
      site({ name: 'B', lon: 12.2, updateIntervalSec: SIM_TICK_SEC }),
    ])
    field.tick([EAST])
    expect(field.contacts).toHaveLength(1)
  })

  it('sweeps the whole disc each tick when updateIntervalSec <= SIM_TICK_SEC', () => {
    const field = new RadarField([site({ updateIntervalSec: SIM_TICK_SEC / 2 })])
    field.tick([SOUTH])
    expect(field.contacts).toHaveLength(1)
    // Every tick expires and repaints: the picture tracks the plane exactly.
    const moved = plane(12.5, 55.2)
    field.tick([moved])
    expect(field.contacts).toEqual([{ lon: 12.5, lat: 55.2, headingDeg: 45, speedKmh: 600 }])
  })

  it('clearContacts empties the picture and reports how many were removed', () => {
    const field = new RadarField([site({ updateIntervalSec: SIM_TICK_SEC })])
    field.tick([EAST, SOUTH])
    expect(field.clearContacts()).toBe(2)
    expect(field.contacts).toHaveLength(0)
    expect(field.clearContacts()).toBe(0)
  })
})

describe('RadarField determinism (fixed-tick sensing)', () => {
  it('yields bit-identical contacts and bearings however frames slice the elapsed time', () => {
    const run = (deltas: number[]) => {
      const field = new RadarField([site({ updateIntervalSec: 6 })])
      const sim = new AircraftSim(field)
      sim.spawn({ lon: 11.8, lat: 54.9, headingDeg: 30, type: 'il20m' })
      for (const d of deltas) sim.advance(d)
      return { contacts: [...field.contacts], bearingDeg: field.bearingOf(0) }
    }
    // Dyadic slices sum to exactly 600 in binary floating point, so both runs
    // consume the identical whole-tick count.
    const sliced = [300, 0.5, 0.25, 0.125, 149.125, 150]
    expect(sliced.reduce((a, b) => a + b, 0)).toBe(600)

    const fastForward = run([600])
    expect(fastForward.contacts.length).toBeGreaterThan(0)
    expect(run(sliced)).toEqual(fastForward)
  })
})
