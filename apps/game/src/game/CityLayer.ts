import Phaser from 'phaser'
import cityIconRaw from 'lucide-static/icons/building-2.svg?raw'
import { DPR, FONT_FAMILY, CITY, DEPTH } from './config'
import { screenPxToWorld } from './units'
import { iconDataUri } from './svgIcon'
import { log } from '../log/logger'

const CITY_ICON_TEXTURE = 'city-icon'

function fail(message: string): never {
  throw new Error(`[game/CityLayer] ${message}`)
}

function assertZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) fail(`zoom must be finite and > 0, got ${zoom}`)
  return zoom
}

export interface CityMarker {
  readonly name: string
  readonly x: number
  readonly y: number
  readonly lon: number
  readonly lat: number
  readonly population: number
}

function assertMarkers(markers: readonly CityMarker[]): void {
  if (markers.length === 0) fail('expected at least one city marker')
  markers.forEach((m, i) => {
    if (typeof m.name !== 'string' || m.name.length === 0) fail(`marker ${i} has no name`)
    for (const [field, value] of [
      ['x', m.x],
      ['y', m.y],
      ['lon', m.lon],
      ['lat', m.lat],
      ['population', m.population],
    ] as const) {
      if (!Number.isFinite(value)) fail(`marker "${m.name}" has a non-finite ${field} (${value})`)
    }
  })
}

/** Renders city markers (a building-2 icon + name label per city) as a self-contained layer. */
export class CityLayer {
  private readonly scene: Phaser.Scene
  private readonly markers: readonly CityMarker[]
  /** One world-space icon Image per city; re-scaled on zoom to hold screen size. */
  private readonly icons: Phaser.GameObjects.Image[]
  /** One world-space Text label per city; re-positioned/re-scaled on zoom. */
  private readonly labels: Phaser.GameObjects.Text[]
  /** Master on/off from the toolbar, independent of the per-zoom label reveal. */
  private layerVisible = true

  /**
   * Rasterise the city icon into a texture. Must run in the scene's `preload` so
   * the texture exists by the time the constructor places the marker images in
   * `create`.
   */
  static preload(scene: Phaser.Scene): void {
    scene.load.svg(CITY_ICON_TEXTURE, iconDataUri(cityIconRaw), {
      width: CITY.iconScreenSize * DPR,
      height: CITY.iconScreenSize * DPR,
    })
  }

  constructor(scene: Phaser.Scene, markers: readonly CityMarker[]) {
    assertMarkers(markers)
    // The icons depend on the texture rasterised in `preload`; if it's absent the
    // caller skipped `CityLayer.preload`. Phaser would silently draw a green
    // placeholder — fail loudly instead of shipping a broken layer.
    if (!scene.textures.exists(CITY_ICON_TEXTURE)) {
      fail(
        `texture "${CITY_ICON_TEXTURE}" is missing — call CityLayer.preload(scene) in the scene's preload() before constructing the layer.`,
      )
    }

    this.scene = scene
    this.markers = markers

    // Icons sit just above the coastline; labels just above the icons (draw order
    // declared centrally in DEPTH). The texture is rasterised at the target device
    // size, so at zoom 1 it's already right; `onZoomChanged` scales it thereafter.
    this.icons = markers.map((m) =>
      scene.add
        .image(m.x, m.y, CITY_ICON_TEXTURE)
        .setOrigin(0.5, 0.5)
        .setDepth(DEPTH.cityDots),
    )

    this.labels = markers.map((m) =>
      scene.add
        .text(m.x, m.y, m.name, {
          fontFamily: FONT_FAMILY,
          fontStyle: CITY.labelFontWeight,
          fontSize: `${CITY.labelScreenSize * DPR}px`,
          color: CITY.labelColor,
          resolution: DPR,
        })
        // Anchor bottom-centre so the label sits above its city, centred on the icon.
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.cityLabels),
    )

    this.onZoomChanged(scene.cameras.main.zoom)

    log.debug(`CityLayer: ${this.markers.length} city markers`)
  }

  /**
   * Every game object this layer owns, so the scene can hand them to the
   * appropriate camera (e.g. tell the fixed UI camera to ignore them).
   */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [...this.icons, ...this.labels]
  }

  /**
   * Show or hide the whole city layer. This is the master toggle driven by the
   * HUD toolbar; the actual on-screen visibility of the name labels is still
   * gated by the per-zoom reveal (`CITY.labelRevealZoom`), so re-showing the
   * layer while zoomed out keeps the names hidden until the player zooms in.
   */
  setVisible(visible: boolean): void {
    this.layerVisible = visible
    this.onZoomChanged(this.scene.cameras.main.zoom)
  }

  /**
   * Re-scale the icons and re-place/scale the labels so each renders at a fixed
   * on-screen size regardless of camera zoom, and apply the per-zoom label reveal
   * (names appear only at/above `CITY.labelRevealZoom`). Cheap — a handful of
   * cities — so it runs on every zoom change.
   */
  onZoomChanged(zoom: number): void {
    assertZoom(zoom)

    // The icon texture is baked at `iconScreenSize * DPR` device px; dividing by
    // the camera zoom cancels the camera's magnification so it holds a constant
    // on-screen size (same trick the labels use).
    const iconScale = 1 / zoom
    // Half the icon's on-screen height plus the gap, in world units, so the label
    // clears the top of the icon.
    const labelOffset = screenPxToWorld(CITY.iconScreenSize / 2 + CITY.labelScreenGap, zoom)
    // Icons follow the master toggle; names also require zooming in past the reveal.
    const labelsVisible = this.layerVisible && zoom >= CITY.labelRevealZoom

    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i]
      this.icons[i].setScale(iconScale).setVisible(this.layerVisible)
      this.labels[i].setScale(iconScale).setPosition(m.x, m.y - labelOffset).setVisible(labelsVisible)
    }
  }
}
