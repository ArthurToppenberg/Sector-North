import { describe, it, expect } from 'vitest'
import { loadBoundaries, BOUNDARY_ASSETS, PROJECTION_FRAME_ASSETS } from './geojson'
// Belgium is the smallest real boundary (~21 KB) — large enough to prove the
// loader on production data, small enough for tsc to type as a JSON module
// (denmark at 321 KB and norway at 4 MB are not).
import realBelgium from '../data/borders/belgium-boundary.json'

function featureCollection(geometry: unknown): unknown {
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry }] }
}

const ring = [
  [10, 55],
  [11, 55],
  [11, 56],
  [10, 55],
]

describe('loadBoundaries', () => {
  it('accepts a real bundled boundary with only finite in-range positions', () => {
    const geometry = loadBoundaries(() => realBelgium, [{ name: 'belgium', url: 'unused' }])
    expect(geometry.length).toBeGreaterThan(0)
    for (const polygon of geometry) {
      for (const [lon, lat] of polygon[0]) {
        expect(Number.isFinite(lon)).toBe(true)
        expect(Number.isFinite(lat)).toBe(true)
      }
    }
  })

  it('accepts Polygon and MultiPolygon geometries', () => {
    const polygon = featureCollection({ type: 'Polygon', coordinates: [ring] })
    expect(loadBoundaries(() => polygon, [{ name: 'p', url: '' }])).toHaveLength(1)

    const multi = featureCollection({ type: 'MultiPolygon', coordinates: [[ring], [ring]] })
    expect(loadBoundaries(() => multi, [{ name: 'mp', url: '' }])).toHaveLength(2)
  })

  it('ignores a third (altitude) element in a position', () => {
    const withAltitude = ring.map(([lon, lat]) => [lon, lat, 123])
    const parsed = loadBoundaries(
      () => featureCollection({ type: 'Polygon', coordinates: [withAltitude] }),
      [{ name: 'alt', url: '' }],
    )
    expect(parsed[0][0][0]).toEqual([10, 55])
  })

  it('rejects a root that is not a FeatureCollection', () => {
    expect(() => loadBoundaries(() => ({ type: 'Feature' }), [{ name: 'x', url: '' }])).toThrow(
      /expected FeatureCollection/,
    )
    expect(() => loadBoundaries(() => null, [{ name: 'x', url: '' }])).toThrow(/root is not an object/)
  })

  it('rejects an empty features array', () => {
    expect(() =>
      loadBoundaries(() => ({ type: 'FeatureCollection', features: [] }), [{ name: 'x', url: '' }]),
    ).toThrow(/non-empty features array/)
  })

  it('rejects unsupported geometry types', () => {
    expect(() =>
      loadBoundaries(() => featureCollection({ type: 'Point', coordinates: [10, 55] }), [
        { name: 'x', url: '' },
      ]),
    ).toThrow(/expected Polygon or MultiPolygon/)
  })

  it('rejects a ring that cannot be a closed loop', () => {
    expect(() =>
      loadBoundaries(
        () => featureCollection({ type: 'Polygon', coordinates: [ring.slice(0, 3)] }),
        [{ name: 'x', url: '' }],
      ),
    ).toThrow(/fewer than 4 positions/)
  })

  it('rejects out-of-range and non-finite coordinates', () => {
    const badLon = [[181, 55], [11, 55], [11, 56], [181, 55]]
    expect(() =>
      loadBoundaries(() => featureCollection({ type: 'Polygon', coordinates: [badLon] }), [
        { name: 'x', url: '' },
      ]),
    ).toThrow(/out-of-range longitude/)

    const stringLat = [[10, '55'], [11, 55], [11, 56], [10, '55']]
    expect(() =>
      loadBoundaries(() => featureCollection({ type: 'Polygon', coordinates: [stringLat] }), [
        { name: 'x', url: '' },
      ]),
    ).toThrow(/out-of-range latitude/)
  })
})

describe('PROJECTION_FRAME_ASSETS', () => {
  it('is exactly the documented six-country frame, each drawn from BOUNDARY_ASSETS', () => {
    // The projection fit — and therefore the locked zoom — is pinned to this set;
    // see apps/game/CLAUDE.md. A change here rescales the whole map.
    expect(PROJECTION_FRAME_ASSETS.map((a) => a.name)).toEqual([
      'denmark',
      'germany',
      'netherlands',
      'norway',
      'poland',
      'sweden',
    ])
    for (const asset of PROJECTION_FRAME_ASSETS) {
      expect(BOUNDARY_ASSETS).toContain(asset)
    }
  })
})
