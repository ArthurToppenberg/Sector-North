import Phaser from 'phaser'
import skagenUrl from './assets/radar/skagen-radarhoved.jpg?url'
import bornholmUrl from './assets/radar/bornholm-rytterknaegten.jpg?url'
import skrydstrupUrl from './assets/radar/skrydstrup-tps-77.jpg?url'

/**
 * A radar's info-window photograph: the Phaser texture key it loads under, the
 * emitted asset URL to load it from, and the on-screen attribution caption the
 * source licence requires (see `assets/radar/CREDITS.md`).
 */
export interface RadarImageAsset {
  readonly textureKey: string
  readonly url: string
  readonly credit: string
}

const RADAR_IMAGES: Record<string, RadarImageAsset> = {
  Skagen: {
    textureKey: 'radar-img:skagen',
    url: skagenUrl,
    credit: 'heb / CC BY-SA 3.0',
  },
  Bornholm: {
    textureKey: 'radar-img:bornholm',
    url: bornholmUrl,
    credit: 'Elgaard / CC BY-SA 4.0',
  },
  // Not the Danish installation (no freely licensed photo of it exists): a
  // Romanian Air Force unit of the same TPS-77 model — see assets/radar/CREDITS.md.
  'Skrydstrup Air Base': {
    textureKey: 'radar-img:skrydstrup',
    url: skrydstrupUrl,
    credit: 'Revista Cer Senin / CC BY-SA 3.0',
  },
}

/**
 * The image asset for a radar by name, or null when it has no photo. Deliberately
 * image-less (not a masked missing asset), so this returns null rather than
 * throwing — the sanctioned fail-fast exception.
 */
export function radarImageAsset(radarName: string): RadarImageAsset | null {
  return RADAR_IMAGES[radarName] ?? null
}

/**
 * Queue every radar photo for loading. Call from `Scene.preload` so the textures
 * exist before any window is opened in `create`/on click.
 */
export function preloadRadarImages(scene: Phaser.Scene): void {
  for (const asset of Object.values(RADAR_IMAGES)) {
    scene.load.image(asset.textureKey, asset.url)
  }
}
