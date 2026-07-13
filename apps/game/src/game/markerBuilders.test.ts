import { describe, it, expect } from 'vitest'
import {
  AIRPORT_LABEL_PRIORITY,
  RADAR_LABEL_PRIORITY,
  buildColocationInputs,
  buildCityMarkers,
  buildAirportMarkers,
  buildRadarMarkers,
  buildRadarSweepMarkers,
} from './markerBuilders'
import type { City } from '../map/cities'
import type { Airport } from '../map/airports'
import type { Radar } from '../map/radars'
import type { Projector } from '../map/project'

// A recognisable fake: proves builders route through the projector and keep the
// GPS truth (lon/lat) on the marker alongside the derived pixels.
const project: Projector = (lon, lat) => [lon * 2, lat * 3]

const city: City = {
  name: 'Testby',
  lon: 12,
  lat: 55,
  population: 1000,
  region: 'R',
  founded: '1868',
  notes: 'n',
}

const airports: Airport[] = [
  { name: 'Mil Base', lon: 10, lat: 56, tier: 'military' },
  { name: 'Big Intl', lon: 11, lat: 57, tier: 'major' },
  { name: 'Grass Strip', lon: 12, lat: 58, tier: 'minor' },
]

const radar: Radar = {
  name: 'Site A',
  model: 'TPS-77',
  lon: 13,
  lat: 59,
  rangeKm: 470,
  updateIntervalSec: 10,
  manufacturer: 'M',
  origin: 'O',
  type: 'T',
  dimensionality: '3D',
  band: 'L',
  altitudeCeilingKm: 30,
  notes: 'n',
}

describe('buildColocationInputs', () => {
  it('emits airports first then radars — the slice seam every consumer relies on', () => {
    const inputs = buildColocationInputs(airports, [radar])
    expect(inputs.map((i) => i.name)).toEqual(['Mil Base', 'Big Intl', 'Grass Strip', 'Site A'])
  })

  it('ranks label ownership military < major < minor < radar', () => {
    const inputs = buildColocationInputs(airports, [radar])
    const priorities = inputs.map((i) => i.priority)
    expect(priorities).toEqual([
      AIRPORT_LABEL_PRIORITY.military,
      AIRPORT_LABEL_PRIORITY.major,
      AIRPORT_LABEL_PRIORITY.minor,
      RADAR_LABEL_PRIORITY,
    ])
    expect([...priorities]).toEqual([...priorities].sort((a, b) => a - b))
  })
})

describe('marker builders', () => {
  it('carry the real lon/lat through alongside the projected pixels', () => {
    const [m] = buildCityMarkers([city], project)
    expect(m).toEqual({ name: 'Testby', x: 24, y: 165, lon: 12, lat: 55, population: 1000 })
  })

  it('apply colocation labels and suppression by index', () => {
    const labels = [
      { label: 'Mil Base +2', suppressed: false },
      { label: 'Big Intl', suppressed: true },
      { label: 'Grass Strip', suppressed: true },
    ]
    const markers = buildAirportMarkers(airports, project, labels)
    expect(markers[0].label).toBe('Mil Base +2')
    expect(markers[0].labelSuppressed).toBe(false)
    expect(markers[1].labelSuppressed).toBe(true)
    expect(markers[2].tier).toBe('minor')
  })

  it('build radar markers with model and label state', () => {
    const [m] = buildRadarMarkers([radar], project, [{ label: 'Site A', suppressed: false }])
    expect(m).toEqual({
      name: 'Site A',
      model: 'TPS-77',
      label: 'Site A',
      labelSuppressed: false,
      x: 26,
      y: 177,
      lon: 13,
      lat: 59,
    })
  })

  it('build sweep markers with the real-km range and period', () => {
    const [m] = buildRadarSweepMarkers([radar], project)
    expect(m).toEqual({ name: 'Site A', x: 26, y: 177, rangeKm: 470, updateIntervalSec: 10 })
  })
})
