import type { MultiPolygon } from './geojson'

/** Target rectangle (device pixels) to fit the geometry into. */
export interface Viewport {
  width: number
  height: number
  /** Uniform inset (device pixels) kept clear around the geometry. */
  padding: number
}

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
  project: (lon: number, lat: number) => [number, number]
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

/**
 * Project a lon/lat MultiPolygon into device pixels, fit to `viewport` with the
 * aspect ratio preserved and the result centered.
 *
 * The projection is an equirectangular (plate carrée) mapping with a
 * `cos(meanLatitude)` correction on longitude. At Denmark's latitude (~56°N) a
 * degree of longitude is only ~0.56× as wide as a degree of latitude; without
 * the correction the country renders badly stretched horizontally. This is
 * cheap (no per-point trig) and accurate enough for a country-scale map.
 *
 * Every ring of every polygon is projected to its own entry in `polygons` —
 * outer boundaries and holes alike. The coastline layer strokes each as an
 * independent closed loop, so an interior ring (e.g. an enclosed enclave)
 * renders as its own outline rather than being dropped.
 */
export function projectToPixels(geometry: MultiPolygon, viewport: Viewport): ProjectedMap {
  const { width, height, padding } = viewport
  const availWidth = width - padding * 2
  const availHeight = height - padding * 2
  if (availWidth <= 0 || availHeight <= 0) {
    throw new Error(`[map/project] viewport too small for padding: ${width}x${height}, pad ${padding}`)
  }

  // Pass 1: lon/lat bounding box across every point.
  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity
  for (const polygon of geometry) {
    for (const point of polygon[0]) {
      const [lon, lat] = point
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }

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
  // Everything else (the polygon buffers below, overlay markers) routes through
  // it so the projection formula lives in exactly one place.
  const project = (lon: number, lat: number): [number, number] => [
    originX + (lon - minLon) * lonScale * scale,
    // Screen Y grows downward, latitude grows upward — flip.
    originY + (maxLat - lat) * scale,
  ]

  const polygons: Float32Array[] = []
  for (const polygon of geometry) {
    for (const ring of polygon) {
      const out = new Float32Array(ring.length * 2)
      for (let i = 0; i < ring.length; i++) {
        const [px, py] = project(ring[i][0], ring[i][1])
        out[i * 2] = px
        out[i * 2 + 1] = py
      }
      polygons.push(out)
    }
  }

  return {
    polygons,
    bounds: { x: originX, y: originY, width: contentWidth, height: contentHeight },
    project,
    // `scale` is pixels per degree of latitude; divide out the km in a degree.
    pixelsPerKm: scale / KM_PER_DEG_LAT,
  }
}
