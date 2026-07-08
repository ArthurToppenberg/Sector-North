// Distil the raw OpenStreetMap aeroway export into the tiny, map-ready airport
// list the game bundles. The raw dump (`data-sources/airports-osm.json`, ~10 MB,
// ~7.9k features) is an inside-the-fence OSM export: navigation aids, taxiways,
// hangars, gates, markings — none of which mean anything on a country-scale radar
// display. The only features worth a marker are the named *aerodromes* (real
// airfields, incl. the military air stations). We reduce each to a single point
// (a representative centroid) and a coarse tier, and emit an array shaped exactly
// like `major-cities.json` so it loads through the same `?raw` path.
//
// Run with:  node scripts/build-airports.mjs
// Re-run whenever the source export is refreshed. Output is committed to git so a
// plain `pnpm build` never needs the raw dump.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../data-sources/airports-osm.json')
const OUT = resolve(here, '../src/data/airports.json')

// Only these aeroway kinds are actual airfields (as opposed to sub-features like
// runways/taxiways that live *inside* an aerodrome). Heliports are excluded per
// the current scope decision (airfields + military airbases only).
const AIRFIELD_AEROWAYS = new Set(['aerodrome', 'airstrip'])

function fail(message) {
  console.error(`[build-airports] ${message}`)
  process.exit(1)
}

/**
 * Coarse tier used to drive the zoom-reveal in the map layer. Derived from the
 * Danish/English name because the OSM export carries no usable class/size tag
 * (`operator_type` is null on all but two features):
 *  - military: an air force station ("Flyvestation").
 *  - major:    a real public airport ("Lufthavn" / "Airport").
 *  - minor:    everything else — grass strips, glider fields, flying clubs.
 */
function classify(name) {
  if (/flyvestation/i.test(name)) return 'military'
  if (/lufthavn|airport/i.test(name)) return 'major'
  return 'minor'
}

/** Shoelace-formula centroid of a closed ring `[[lon,lat], ...]`. */
function ringCentroid(ring) {
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i]
    const [x1, y1] = ring[i + 1]
    const cross = x0 * y1 - x1 * y0
    area += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  }
  area *= 0.5
  // Degenerate ring (zero area / collinear): fall back to the vertex mean so a
  // marker still lands somewhere sensible rather than dividing by zero.
  if (Math.abs(area) < 1e-12) {
    const sum = ring.reduce(([sx, sy], [x, y]) => [sx + x, sy + y], [0, 0])
    return [sum[0] / ring.length, sum[1] / ring.length]
  }
  return [cx / (6 * area), cy / (6 * area)]
}

/** Reduce any geometry to a single representative [lon, lat] point. */
function representativePoint(geom) {
  switch (geom.type) {
    case 'Point':
      return geom.coordinates
    case 'LineString': {
      // A runway/strip line: use its midpoint by vertex (good enough at this scale).
      const pts = geom.coordinates
      const mid = pts[Math.floor(pts.length / 2)]
      return mid
    }
    case 'Polygon':
      return ringCentroid(geom.coordinates[0])
    case 'MultiPolygon': {
      // Use the centroid of the largest ring by vertex count — the main field.
      let best = null
      let bestLen = -1
      for (const poly of geom.coordinates) {
        if (poly[0].length > bestLen) {
          bestLen = poly[0].length
          best = poly[0]
        }
      }
      return ringCentroid(best)
    }
    default:
      fail(`unsupported geometry type: ${geom.type}`)
  }
}

const raw = JSON.parse(readFileSync(SRC, 'utf8'))
if (raw.type !== 'FeatureCollection' || !Array.isArray(raw.features)) {
  fail('source is not a GeoJSON FeatureCollection')
}

// Keep only named airfields, then dedupe by name (OSM often carries the same
// field as both a boundary polygon and a point). Prefer the entry we see first.
const byName = new Map()
for (const f of raw.features) {
  const p = f.properties ?? {}
  if (!AIRFIELD_AEROWAYS.has(p.aeroway)) continue
  const name = p.name
  if (typeof name !== 'string' || name.length === 0) continue
  if (byName.has(name)) continue

  const [lon, lat] = representativePoint(f.geometry)
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    fail(`airfield "${name}" produced a non-finite point`)
  }

  byName.set(name, {
    name,
    name_en: p.name_en || null,
    lon: Number(lon.toFixed(5)),
    lat: Number(lat.toFixed(5)),
    tier: classify(name),
  })
}

const airports = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'da'))
if (airports.length === 0) fail('no airfields survived distillation — check the source')

writeFileSync(OUT, JSON.stringify(airports, null, 2) + '\n')

const counts = airports.reduce((acc, a) => ((acc[a.tier] = (acc[a.tier] ?? 0) + 1), acc), {})
console.log(`[build-airports] ${airports.length} airfields -> ${OUT}`)
console.log(`[build-airports] tiers:`, counts)
