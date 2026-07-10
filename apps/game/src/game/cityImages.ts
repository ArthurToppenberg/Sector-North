import Phaser from 'phaser'
import copenhagenUrl from './assets/city/copenhagen-nyhavn.jpg?url'
import aarhusUrl from './assets/city/aarhus-aros-rainbow.jpg?url'
import odenseUrl from './assets/city/odense-hc-andersen-house.jpg?url'
import aalborgUrl from './assets/city/aalborg-utzon-center.jpg?url'
import esbjergUrl from './assets/city/esbjerg-men-at-sea.jpg?url'

/**
 * A city's info-window photograph: the Phaser texture key it loads under, the
 * emitted asset URL to load it from, and the on-screen attribution caption the
 * source licence requires (see `assets/city/CREDITS.md`). Mirrors the radar photo
 * join in `radarImages.ts` — the seam between pure world data (`src/map/cities.ts`)
 * and the bundled photos, kept out of the map layer on purpose.
 */
export interface CityImageAsset {
  readonly textureKey: string
  readonly url: string
  readonly credit: string
}

const CITY_IMAGES: Record<string, CityImageAsset> = {
  Copenhagen: {
    textureKey: 'city-img:copenhagen',
    url: copenhagenUrl,
    credit: 'Moahim / CC BY-SA 4.0',
  },
  Aarhus: {
    textureKey: 'city-img:aarhus',
    url: aarhusUrl,
    credit: 'Gordon Leggett / CC BY-SA 4.0',
  },
  Odense: {
    textureKey: 'city-img:odense',
    url: odenseUrl,
    credit: 'Bo Jessen / CC0',
  },
  Aalborg: {
    textureKey: 'city-img:aalborg',
    url: aalborgUrl,
    credit: 'Daderot / CC0',
  },
  Esbjerg: {
    textureKey: 'city-img:esbjerg',
    url: esbjergUrl,
    credit: 'Jazia / CC BY-SA 4.0',
  },
}

/**
 * The image asset for a city by name, or null when it has no photo. Every current
 * city has one, but — like the radar join — a genuinely photo-less city is a valid
 * case (its window shows the "NO IMAGE" placeholder), so this returns null rather
 * than throwing: the sanctioned fail-fast exception.
 */
export function cityImageAsset(cityName: string): CityImageAsset | null {
  return CITY_IMAGES[cityName] ?? null
}

/**
 * Queue every city photo for loading. Call from `Scene.preload` so the textures
 * exist before any window is opened in `create`/on click.
 */
export function preloadCityImages(scene: Phaser.Scene): void {
  for (const asset of Object.values(CITY_IMAGES)) {
    scene.load.image(asset.textureKey, asset.url)
  }
}
