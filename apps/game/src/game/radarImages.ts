import Phaser from 'phaser'
import skagenUrl from './assets/radar/skagen-radarhoved.jpg?url'
import bornholmUrl from './assets/radar/bornholm-rytterknaegten.jpg?url'

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

/**
 * Radar name (the id in `radars.json`) → its image asset. This is the join
 * between the world data and the bundled photos; keeping it here leaves
 * `src/map/radars.ts` pure data (no asset URLs).
 *
 * Deliberately partial: only Skagen and Bornholm have a photo of the real Danish
 * site that we have permission to use. The other radars have no entry and their
 * windows show the "NO IMAGE" placeholder — a genuinely image-less case, not a
 * missing asset, so the lookup returns null rather than throwing.
 */
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
}

/** The image asset for a radar by name, or null when it has no photo yet. */
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
