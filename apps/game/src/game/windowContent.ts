// Record → InfoWindowContent builders, living beside cityImages/radarImages —
// their sole content consumers. The window component stays entity-agnostic;
// each new clickable type gets its own builder here instead of editing the window.
import type { City } from '../map/cities'
import type { Airport, AirportTier } from '../map/airports'
import type { Radar } from '../map/radars'
import type { InfoWindowContent } from './hud/InfoWindow'
import { cityImageAsset } from './cityImages'
import { airportImageAsset } from './airportImages'
import { radarImageAsset } from './radarImages'

export function cityWindowContent(city: City): InfoWindowContent {
  // Every current city has a photo, but a photo-less city is a valid case that
  // falls back to the placeholder — same contract as the radar builder.
  const image = cityImageAsset(city.name)
  return {
    title: city.name,
    imageTextureKey: image?.textureKey,
    imageCredit: image?.credit,
    fields: [
      { label: 'Region', value: city.region },
      { label: 'Population', value: city.population.toLocaleString('en-US') },
      { label: 'Founded', value: city.founded },
      { label: 'Notes', value: city.notes },
    ],
  }
}

const TIER_LABELS: Record<AirportTier, string> = {
  major: 'Major airport',
  minor: 'Minor airfield',
  military: 'Military airbase',
}

function formatPosition(lon: number, lat: number): string {
  const latHemisphere = lat >= 0 ? 'N' : 'S'
  const lonHemisphere = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}° ${latHemisphere}, ${Math.abs(lon).toFixed(4)}° ${lonHemisphere}`
}

export function airportWindowContent(airport: Airport): InfoWindowContent {
  // Most minor strips have no freely licensed photo and fall back to the placeholder.
  const image = airportImageAsset(airport.name)
  return {
    title: airport.name,
    imageTextureKey: image?.textureKey,
    imageCredit: image?.credit,
    fields: [
      { label: 'Type', value: TIER_LABELS[airport.tier] },
      { label: 'Position', value: formatPosition(airport.lon, airport.lat) },
    ],
  }
}

export function radarWindowContent(radar: Radar): InfoWindowContent {
  // Only some sites have a usable photo; the rest fall back to the placeholder.
  const image = radarImageAsset(radar.name)
  return {
    title: radar.name,
    imageTextureKey: image?.textureKey,
    imageCredit: image?.credit,
    fields: [
      { label: 'Model', value: radar.model },
      { label: 'Manufacturer', value: radar.manufacturer },
      { label: 'Origin', value: radar.origin },
      { label: 'Type', value: radar.type },
      { label: 'Dimensionality', value: radar.dimensionality },
      { label: 'Band', value: `${radar.band}-band` },
      { label: 'Range', value: `${radar.rangeKm} km` },
      { label: 'Update interval', value: `${radar.updateIntervalSec} s` },
      {
        label: 'Altitude ceiling',
        value: radar.altitudeCeilingKm === null ? 'N/A' : `${radar.altitudeCeilingKm} km`,
      },
      { label: 'Notes', value: radar.notes },
    ],
  }
}
