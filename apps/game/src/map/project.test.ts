import { describe, it, expect } from 'vitest'
import { projectToPixels, KM_PER_DEG_LAT, type Viewport } from './project'
import type { MultiPolygon, Polygon } from './geojson'

const DEG2RAD = Math.PI / 180

function square(minLon: number, minLat: number, maxLon: number, maxLat: number): Polygon {
  return [
    [
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat],
    ],
  ]
}

// 2°×2° box around southern Scandinavia; mean latitude 56°.
const FRAME: MultiPolygon = [square(10, 55, 12, 57)]
const VIEWPORT: Viewport = { width: 1000, height: 800, padding: 50 }

describe('projectToPixels', () => {
  it('maps the fit corner (minLon, maxLat) to the bounds origin', () => {
    const { project, bounds } = projectToPixels(FRAME, VIEWPORT)
    expect(project(10, 57)).toEqual([bounds.x, bounds.y])
  })

  it('flips the y axis: higher latitude draws higher on screen (smaller y)', () => {
    const { project } = projectToPixels(FRAME, VIEWPORT)
    expect(project(10, 57)[1]).toBeLessThan(project(10, 55)[1])
  })

  it('compresses longitude by cos(meanLatitude)', () => {
    const { project } = projectToPixels(FRAME, VIEWPORT)
    const pxPerDegLon = project(11, 55)[0] - project(10, 55)[0]
    const pxPerDegLat = project(10, 55)[1] - project(10, 56)[1]
    expect(pxPerDegLon / pxPerDegLat).toBeCloseTo(Math.cos(56 * DEG2RAD), 12)
  })

  it('reports pixelsPerKm consistent with the latitude scale', () => {
    const { project, pixelsPerKm } = projectToPixels(FRAME, VIEWPORT)
    const pxPerDegLat = project(10, 55)[1] - project(10, 56)[1]
    expect(pxPerDegLat).toBeCloseTo(pixelsPerKm * KM_PER_DEG_LAT, 9)
  })

  it('fits the drawn bounds inside the viewport padding, filling one axis', () => {
    const { bounds } = projectToPixels(FRAME, VIEWPORT)
    const { width, height, padding } = VIEWPORT
    expect(bounds.x).toBeGreaterThanOrEqual(padding)
    expect(bounds.y).toBeGreaterThanOrEqual(padding)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - padding)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(height - padding)
    const fillsWidth = Math.abs(bounds.width - (width - padding * 2)) < 1e-9
    const fillsHeight = Math.abs(bounds.height - (height - padding * 2)) < 1e-9
    expect(fillsWidth || fillsHeight).toBe(true)
  })

  it('pins the fit to fitGeometry: extra context geometry never rescales the map', () => {
    // The locked-zoom invariant: adding context boundaries to the drawn set must
    // not move a single projected pixel as long as the frame stays the same.
    const context: MultiPolygon = [square(-5, 45, 30, 70)]
    const pinned = projectToPixels([...FRAME, ...context], VIEWPORT, FRAME)
    const frameOnly = projectToPixels(FRAME, VIEWPORT)
    expect(pinned.project(10.5, 55.5)).toEqual(frameOnly.project(10.5, 55.5))
    expect(pinned.pixelsPerKm).toBe(frameOnly.pixelsPerKm)
    expect(pinned.bounds).toEqual(frameOnly.bounds)
  })

  it('projects every ring — outer and hole — into its own flat interleaved buffer', () => {
    const withHole: MultiPolygon = [
      [
        square(10, 55, 12, 57)[0],
        [
          [10.5, 55.5],
          [11.5, 55.5],
          [11.5, 56.5],
          [10.5, 55.5],
        ],
      ],
    ]
    const { polygons } = projectToPixels(withHole, VIEWPORT)
    expect(polygons).toHaveLength(2)
    expect(polygons[0]).toBeInstanceOf(Float32Array)
    expect(polygons[0]).toHaveLength(5 * 2)
    expect(polygons[1]).toHaveLength(4 * 2)
  })

  it('throws on a non-finite viewport dimension', () => {
    expect(() => projectToPixels(FRAME, { width: Number.NaN, height: 800, padding: 50 })).toThrow(
      /non-finite viewport/,
    )
  })

  it('throws on negative padding', () => {
    expect(() => projectToPixels(FRAME, { width: 1000, height: 800, padding: -1 })).toThrow(
      /negative viewport padding/,
    )
  })

  it('throws when padding leaves no drawable area', () => {
    expect(() => projectToPixels(FRAME, { width: 1000, height: 800, padding: 400 })).toThrow(
      /viewport too small for padding/,
    )
  })

  it('throws on empty geometry', () => {
    expect(() => projectToPixels([], VIEWPORT)).toThrow(/no finite points/)
  })

  it('throws on zero-extent geometry', () => {
    const point: MultiPolygon = [
      [
        [
          [10, 55],
          [10, 55],
          [10, 55],
          [10, 55],
        ],
      ],
    ]
    expect(() => projectToPixels(point, VIEWPORT)).toThrow(/zero extent/)
  })

  it('projector throws on a non-finite coordinate instead of yielding NaN pixels', () => {
    const { project } = projectToPixels(FRAME, VIEWPORT)
    expect(() => project(Number.NaN, 55)).toThrow(/non-finite coordinate/)
    expect(() => project(10, Infinity)).toThrow(/non-finite coordinate/)
  })
})
