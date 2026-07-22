import Phaser from 'phaser'
import billundUrl from './assets/airport/billund-airport.jpg?url'
import bornholmUrl from './assets/airport/bornholms-lufthavn.jpg?url'
import christianshedeUrl from './assets/airport/christianshede-flyveplads.jpg?url'
import esbjergUrl from './assets/airport/esbjerg-lufthavn.jpg?url'
import karupBaseUrl from './assets/airport/flyvestation-karup.jpg?url'
import skrydstrupBaseUrl from './assets/airport/flyvestation-skrydstrup.jpg?url'
import aalborgBaseUrl from './assets/airport/flyvestation-aalborg.jpg?url'
import frederiksundNordUrl from './assets/airport/frederiksund-nord.jpg?url'
import hcAndersenUrl from './assets/airport/hans-christian-andersen-airport.jpg?url'
import holstebroUrl from './assets/airport/holstebro-flyveklub.jpg?url'
import koebenhavnUrl from './assets/airport/koebenhavns-lufthavn.jpg?url'
import lollandFalsterUrl from './assets/airport/lolland-falster-lufthavn.jpg?url'
import laesoeUrl from './assets/airport/laesoe-flyveplads.jpg?url'
import midtjyllandKarupUrl from './assets/airport/midtjylland-karup-airport.jpg?url'
import morsoeUrl from './assets/airport/morsoe-flyveplads.jpg?url'
import randersUrl from './assets/airport/randers-flyveplads.jpg?url'
import ringstedUrl from './assets/airport/ringsted-flyveplads.jpg?url'
import roskildeUrl from './assets/airport/roskilde-lufthavn.jpg?url'
import samsoeUrl from './assets/airport/samsoe-flyveplads.jpg?url'
import sindalUrl from './assets/airport/sindal-lufthavn-i-s.jpg?url'
import stauningUrl from './assets/airport/stauning-lufthavn.jpg?url'
import arnborgUrl from './assets/airport/svaeveflyvecenter-arnborg.jpg?url'
import soenderborgUrl from './assets/airport/soenderborg-lufthavn.jpg?url'
import thistedUrl from './assets/airport/thisted-lufthavn.jpg?url'
import trueUrl from './assets/airport/true-svaeveflyvebane.jpg?url'
import toenderUrl from './assets/airport/toender-flyveplads.jpg?url'
import vesthimmerlandsUrl from './assets/airport/vesthimmerlands-flyveplads.jpg?url'
import vojensUrl from './assets/airport/vojens-lufthavn.jpg?url'
import aeroeUrl from './assets/airport/aeroe-flyveplads.jpg?url'
import aalborgUrl from './assets/airport/aalborg-lufthavn.jpg?url'
import aarhusUrl from './assets/airport/aarhus-lufthavn.jpg?url'
import aarhusVandUrl from './assets/airport/aarhus-vandflyveplads.jpg?url'

/**
 * An airfield's info-window photograph: the Phaser texture key it loads under,
 * the emitted asset URL to load it from, and the on-screen attribution caption
 * the source licence requires (see `assets/airport/CREDITS.md`).
 */
export interface AirportImageAsset {
  readonly textureKey: string
  readonly url: string
  readonly credit: string
}

const AIRPORT_IMAGES: Record<string, AirportImageAsset> = {
  'Billund Airport': {
    textureKey: 'airport-img:billund-airport',
    url: billundUrl,
    credit: 'Nico-dk / CC BY-SA 3.0',
  },
  'Bornholms Lufthavn': {
    textureKey: 'airport-img:bornholms-lufthavn',
    url: bornholmUrl,
    credit: 'Andreas Faessler / CC BY-SA 3.0',
  },
  'Christianshede Flyveplads': {
    textureKey: 'airport-img:christianshede-flyveplads',
    url: christianshedeUrl,
    credit: 'Carsten Wiehe / CC BY 3.0',
  },
  'Esbjerg Lufthavn': {
    textureKey: 'airport-img:esbjerg-lufthavn',
    url: esbjergUrl,
    credit: 'Stahlkocher / CC BY-SA 3.0',
  },
  'Flyvestation Karup': {
    textureKey: 'airport-img:flyvestation-karup',
    url: karupBaseUrl,
    credit: 'Carsten Wiehe / CC BY-SA 3.0',
  },
  'Flyvestation Skrydstrup': {
    textureKey: 'airport-img:flyvestation-skrydstrup',
    url: skrydstrupBaseUrl,
    credit: 'Beethoven9 / CC BY-SA 4.0',
  },
  'Flyvestation Aalborg': {
    textureKey: 'airport-img:flyvestation-aalborg',
    url: aalborgBaseUrl,
    credit: 'Carsten Wiehe / CC BY-SA 3.0',
  },
  'Frederiksund Nord': {
    textureKey: 'airport-img:frederiksund-nord',
    url: frederiksundNordUrl,
    credit: 'neogeografen / CC BY-SA 4.0',
  },
  'Hans Christian Andersen Airport': {
    textureKey: 'airport-img:hans-christian-andersen-airport',
    url: hcAndersenUrl,
    credit: 'Kåre Thor Olsen / CC BY-SA 3.0',
  },
  'Holstebro Flyveklub': {
    textureKey: 'airport-img:holstebro-flyveklub',
    url: holstebroUrl,
    credit: 'Beethoven9 / CC BY-SA 4.0',
  },
  'Københavns Lufthavn': {
    textureKey: 'airport-img:koebenhavns-lufthavn',
    url: koebenhavnUrl,
    credit: 'kallerna / CC BY-SA 4.0',
  },
  'Lolland Falster Lufthavn': {
    textureKey: 'airport-img:lolland-falster-lufthavn',
    url: lollandFalsterUrl,
    credit: 'Casperwo / Public domain',
  },
  'Læsø Flyveplads': {
    textureKey: 'airport-img:laesoe-flyveplads',
    url: laesoeUrl,
    credit: 'Ahjdp / CC BY-SA 4.0',
  },
  'Midtjylland Karup Airport': {
    textureKey: 'airport-img:midtjylland-karup-airport',
    url: midtjyllandKarupUrl,
    credit: 'Lars Schmidt / CC BY-SA 3.0',
  },
  'Morsø Flyveplads': {
    textureKey: 'airport-img:morsoe-flyveplads',
    url: morsoeUrl,
    credit: 'joost j. bakker / CC BY 2.0',
  },
  'Randers Flyveplads': {
    textureKey: 'airport-img:randers-flyveplads',
    url: randersUrl,
    credit: 'Malene Thyssen / CC BY-SA 4.0',
  },
  'Ringsted Flyveplads': {
    textureKey: 'airport-img:ringsted-flyveplads',
    url: ringstedUrl,
    credit: 'Toxophilus / CC BY-SA 4.0',
  },
  'Roskilde Lufthavn': {
    textureKey: 'airport-img:roskilde-lufthavn',
    url: roskildeUrl,
    credit: 'Mogens Engelund / CC BY-SA 3.0',
  },
  'Samsø Flyveplads': {
    textureKey: 'airport-img:samsoe-flyveplads',
    url: samsoeUrl,
    credit: 'L-BBE / CC BY 3.0',
  },
  'Sindal Lufthavn I/S': {
    textureKey: 'airport-img:sindal-lufthavn-i-s',
    url: sindalUrl,
    credit: 'Matthias Schalk / CC BY-SA 3.0',
  },
  'Stauning Lufthavn': {
    textureKey: 'airport-img:stauning-lufthavn',
    url: stauningUrl,
    credit: 'M_H.DE / CC BY-SA 4.0',
  },
  'Svæveflyvecenter Arnborg': {
    textureKey: 'airport-img:svaeveflyvecenter-arnborg',
    url: arnborgUrl,
    credit: 'Hjart / CC BY-SA 4.0',
  },
  'Sønderborg Lufthavn': {
    textureKey: 'airport-img:soenderborg-lufthavn',
    url: soenderborgUrl,
    credit: 'Nis Hoff / CC0',
  },
  'Thisted Lufthavn': {
    textureKey: 'airport-img:thisted-lufthavn',
    url: thistedUrl,
    credit: 'City84 / CC BY-SA 4.0',
  },
  'True Svæveflyvebane': {
    textureKey: 'airport-img:true-svaeveflyvebane',
    url: trueUrl,
    credit: 'Villy Fink Isaksen / CC BY-SA 3.0',
  },
  'Tønder Flyveplads': {
    textureKey: 'airport-img:toender-flyveplads',
    url: toenderUrl,
    credit: 'Hjart / CC BY-SA 4.0',
  },
  'Vesthimmerlands Flyveplads': {
    textureKey: 'airport-img:vesthimmerlands-flyveplads',
    url: vesthimmerlandsUrl,
    credit: 'Poul G / CC BY-SA 3.0',
  },
  'Vojens Lufthavn': {
    textureKey: 'airport-img:vojens-lufthavn',
    url: vojensUrl,
    credit: 'Mef.ellingen / CC BY-SA 4.0',
  },
  'Ærø Flyveplads': {
    textureKey: 'airport-img:aeroe-flyveplads',
    url: aeroeUrl,
    credit: 'Carsten Steger / CC BY-SA 4.0',
  },
  'Aalborg Lufthavn': {
    textureKey: 'airport-img:aalborg-lufthavn',
    url: aalborgUrl,
    credit: 'Simon Wedege Petersen / CC BY 3.0',
  },
  'Aarhus Lufthavn': {
    textureKey: 'airport-img:aarhus-lufthavn',
    url: aarhusUrl,
    credit: 'EHRENBERG Kommunikation / CC BY 2.0',
  },
  'Aarhus Vandflyveplads': {
    textureKey: 'airport-img:aarhus-vandflyveplads',
    url: aarhusVandUrl,
    credit: 'Steve Knight / CC BY 2.0',
  },
}

/**
 * The image asset for an airfield by name, or null when it has no photo. Most
 * minor strips are deliberately image-less (no freely licensed photo exists, not
 * a masked missing asset), so this returns null rather than throwing — the
 * sanctioned fail-fast exception, same contract as the radar/city joins.
 */
export function airportImageAsset(airportName: string): AirportImageAsset | null {
  return AIRPORT_IMAGES[airportName] ?? null
}

/**
 * Queue every airfield photo for loading. Call from `Scene.preload` so the
 * textures exist before any window is opened in `create`/on click.
 */
export function preloadAirportImages(scene: Phaser.Scene): void {
  for (const asset of Object.values(AIRPORT_IMAGES)) {
    scene.load.image(asset.textureKey, asset.url)
  }
}
