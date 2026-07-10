import type { MultiPolygon } from './geojson'

/** Target rectangle (device pixels) to fit the geometry into. */
export interface Viewport {
  width: number
  height: number
  /** Uniform inset (device pixels) kept clear around the geometry. */
  padding: number
}

export type Projector = (lon: number, lat: number) => [number, number]

/** Device-pixel axis-aligned rectangle. */
export interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ProjectedMap {
  // One flat Float32Array per ring: interleaved [x0,y0,x1,y1,…] device pixels.
  polygons: Float32Array[]
  bounds: PixelRect
  project: Projector
  pixelsPerKm: number
}

const DEG2RAD = Math.PI / 180

// Length of one degree of latitude on a spherical Earth (mean radius 6371 km):
// (π/180) · 6371 ≈ 111.195 km. Constant to well within a country-scale map's
// accuracy needs.
export const KM_PER_DEG_LAT = 111.195

/** lon/lat axis-aligned bounding box, in degrees. */
interface LonLatBounds {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

interface Fit {
  originX: number
  originY: number
  /** Device pixels per degree of latitude. Uniform across both axes. */
  scale: number
  /** Longitude compression: `cos(meanLatitude)`. */
  lonScale: number
  minLon: number
  maxLat: number
  contentWidth: number
  contentHeight: number
}

/** Usable area inside the viewport's padding, in device pixels. */
interface DrawableArea {
  width: number
  height: number
}

/**
 * Validate the viewport and return the drawable area inside its padding.
 * Throws on any non-finite dimension, negative padding, or an area that the
 * padding leaves empty — a bad viewport must surface here, never fold into a
 * degenerate fit downstream.
 */
function drawableArea({ width, height, padding }: Viewport): DrawableArea {
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
  return { width: availWidth, height: availHeight }
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

function computeFit(
  { minLon, minLat, maxLon, maxLat }: LonLatBounds,
  area: DrawableArea,
  viewport: Viewport,
): Fit {
  const lonScale = Math.cos(((minLat + maxLat) / 2) * DEG2RAD)
  const worldWidth = (maxLon - minLon) * lonScale
  const worldHeight = maxLat - minLat
  if (worldWidth <= 0 || worldHeight <= 0) {
    throw new Error('[map/project] geometry has zero extent')
  }

  // Single uniform scale fits the tighter axis; the geometry is then centered.
  const scale = Math.min(area.width / worldWidth, area.height / worldHeight)
  const contentWidth = worldWidth * scale
  const contentHeight = worldHeight * scale
  return {
    originX: (viewport.width - contentWidth) / 2,
    originY: (viewport.height - contentHeight) / 2,
    scale,
    lonScale,
    minLon,
    maxLat,
    contentWidth,
    contentHeight,
  }
}

/**
 * Rejects any non-finite lon/lat by throwing: a bad coordinate must not silently
 * project to a NaN (or worse, a plausible-looking) pixel.
 */
function makeProjector({ originX, originY, scale, lonScale, minLon, maxLat }: Fit): Projector {
  return (lon, lat) => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      throw new Error(`[map/project] non-finite coordinate: lon ${lon}, lat ${lat}`)
    }
    return [
      originX + (lon - minLon) * lonScale * scale,
      // Screen Y grows downward, latitude grows upward — flip.
      originY + (maxLat - lat) * scale,
    ]
  }
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
 * Project a lon/lat MultiPolygon into device pixels, fit to `viewport` (aspect
 * preserved, centered). `fitGeometry` (default `geometry`) is the subset the fit
 * is computed from; pass a fixed frame to pin scale/zoom while still drawing all
 * of `geometry` through one projector. See apps/game/CLAUDE.md.
 */
export function projectToPixels(
  geometry: MultiPolygon,
  viewport: Viewport,
  fitGeometry: MultiPolygon = geometry,
): ProjectedMap {
  const area = drawableArea(viewport)
  const fit = computeFit(boundingBox(fitGeometry), area, viewport)
  const project = makeProjector(fit)

  return {
    polygons: projectRings(geometry, project),
    bounds: {
      x: fit.originX,
      y: fit.originY,
      width: fit.contentWidth,
      height: fit.contentHeight,
    },
    project,
    // `scale` is pixels per degree of latitude; divide out the km in a degree.
    pixelsPerKm: fit.scale / KM_PER_DEG_LAT,
  }
}
