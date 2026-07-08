import type { MultiPolygon } from './geojson'

/** Target rectangle (device pixels) to fit the geometry into. */
export interface Viewport {
  width: number
  height: number
  /** Uniform inset (device pixels) kept clear around the geometry. */
  padding: number
}

/**
 * The single lon/lat → device-pixel transform. Every overlay (city markers,
 * future aircraft, anything placed on the map) routes through one of these so
 * the projection formula lives in exactly one place.
 */
export type Projector = (lon: number, lat: number) => [number, number]

export interface ProjectedMap {
  /**
   * One entry per polygon: interleaved `[x0, y0, x1, y1, ...]` device-pixel
   * coordinates. Flat typed arrays keep the projected geometry compact and
   * cache-friendly to iterate when drawing.
   */
  polygons: Float32Array[]
  /** Device-pixel bounding box of the drawn geometry within the viewport. */
  bounds: { x: number; y: number; width: number; height: number }
  /**
   * Project any lon/lat point into the same device-pixel world space as the
   * polygons above. Lets overlays (city markers, etc.) share the map's exact
   * fit without re-deriving the projection.
   */
  project: Projector
  /**
   * Device pixels per real-world kilometre in this projection. The uniform
   * `scale` is pixels-per-degree-of-latitude, and the `cos(lat)` longitude
   * correction makes a longitude kilometre cover the same pixel span as a
   * latitude kilometre — so this single factor is valid on both axes and a
   * real-world square (e.g. a 50 km grid cell) renders square. Lets overlays
   * express real distances without re-deriving the fit.
   */
  pixelsPerKm: number
}

const DEG2RAD = Math.PI / 180

// Length of one degree of latitude on a spherical Earth (mean radius 6371 km):
// (π/180) · 6371 ≈ 111.195 km. Constant to well within a country-scale map's
// accuracy needs.
const KM_PER_DEG_LAT = 111.195

/** lon/lat axis-aligned bounding box, in degrees. */
interface LonLatBounds {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

/**
 * Axis-aligned lon/lat bounding box across every outer ring of the geometry.
 * Only the outer boundary (`polygon[0]`) is scanned — holes are always inside
 * it, so they cannot widen the box. Throws if no finite point is found, rather
 * than returning the sentinel ±Infinity extents that would poison the fit.
 */
function boundingBox(geometry: MultiPolygon): LonLatBounds {
  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity
  for (const polygon of geometry) {
    for (const [lon, lat] of polygon[0]) {
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }
  if (
    !Number.isFinite(minLon) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLon) ||
    !Number.isFinite(maxLat)
  ) {
    throw new Error('[map/project] geometry has no finite points')
  }
  return { minLon, minLat, maxLon, maxLat }
}

/**
 * Project every ring of every polygon — outer boundaries and holes alike — into
 * its own flat `[x0, y0, x1, y1, ...]` buffer. The coastline layer strokes each
 * as an independent closed loop, so an interior ring (e.g. an enclosed enclave)
 * renders as its own outline rather than being dropped.
 */
function projectRings(geometry: MultiPolygon, project: Projector): Float32Array[] {
  const polygons: Float32Array[] = []
  for (const polygon of geometry) {
    for (const ring of polygon) {
      const out = new Float32Array(ring.length * 2)
      for (let i = 0; i < ring.length; i++) {
        const [x, y] = project(ring[i][0], ring[i][1])
        out[i * 2] = x
        out[i * 2 + 1] = y
      }
      polygons.push(out)
    }
  }
  return polygons
}

/**
 * Project a lon/lat MultiPolygon into device pixels, fit to `viewport` with the
 * aspect ratio preserved and the result centered.
 *
 * The projection is an equirectangular (plate carrée) mapping with a
 * `cos(meanLatitude)` correction on longitude. At Denmark's latitude (~56°N) a
 * degree of longitude is only ~0.56× as wide as a degree of latitude; without
 * the correction the country renders badly stretched horizontally. This is
 * cheap (no per-point trig) and accurate enough for a country-scale map.
 */
export function projectToPixels(geometry: MultiPolygon, viewport: Viewport): ProjectedMap {
  const { width, height, padding } = viewport
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(padding)) {
    throw new Error(`[map/project] non-finite viewport: ${width}x${height}, pad ${padding}`)
  }
  if (padding < 0) {
    throw new Error(`[map/project] negative viewport padding: ${padding}`)
  }
  const availWidth = width - padding * 2
  const availHeight = height - padding * 2
  if (availWidth <= 0 || availHeight <= 0) {
    throw new Error(`[map/project] viewport too small for padding: ${width}x${height}, pad ${padding}`)
  }

  const { minLon, minLat, maxLon, maxLat } = boundingBox(geometry)

  // World units: longitude compressed by cos(mean latitude), latitude as-is.
  const lonScale = Math.cos(((minLat + maxLat) / 2) * DEG2RAD)
  const worldWidth = (maxLon - minLon) * lonScale
  const worldHeight = maxLat - minLat
  if (worldWidth <= 0 || worldHeight <= 0) {
    throw new Error('[map/project] geometry has zero extent')
  }

  // Single uniform scale fits the tighter axis; the geometry is then centered.
  const scale = Math.min(availWidth / worldWidth, availHeight / worldHeight)
  const contentWidth = worldWidth * scale
  const contentHeight = worldHeight * scale
  const originX = (width - contentWidth) / 2
  const originY = (height - contentHeight) / 2

  // The one lon/lat → device-pixel transform this whole module exists to define.
  const project: Projector = (lon, lat) => [
    originX + (lon - minLon) * lonScale * scale,
    // Screen Y grows downward, latitude grows upward — flip.
    originY + (maxLat - lat) * scale,
  ]

  return {
    polygons: projectRings(geometry, project),
    bounds: { x: originX, y: originY, width: contentWidth, height: contentHeight },
    project,
    // `scale` is pixels per degree of latitude; divide out the km in a degree.
    pixelsPerKm: scale / KM_PER_DEG_LAT,
  }
}
