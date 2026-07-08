import Phaser from 'phaser'
import cityIconRaw from 'lucide-static/icons/building-2.svg?raw'
import { DPR, FONT_FAMILY, CITY, DEPTH } from './config'
import { screenPxToWorld } from './units'
import { iconDataUri } from './svgIcon'

/** Phaser texture key for the rasterised city marker glyph. */
const CITY_ICON_TEXTURE = 'city-icon'

/**
 * A city placed in world space (device px), ready to render.
 *
 * The projected `x/y` are what this layer draws, but the real lon/lat and
 * population are carried alongside — never discarded — so later milestones
 * (aircraft targeting cities, re-projection, sizing dots by population) can work
 * from the ground truth rather than the derived pixels.
 */
export interface CityMarker {
  readonly name: string
  /** Projected device-pixel position (derived from lon/lat for the current fit). */
  readonly x: number
  readonly y: number
  /** Real-world coordinates in lon/lat degrees — the source of truth. */
  readonly lon: number
  readonly lat: number
  readonly population: number
}

/**
 * Reject anything unexpected up front (fail fast): the layer must draw a real,
 * non-empty set of cities whose projected pixels and source-of-truth lon/lat are
 * finite. A NaN position would silently vanish and a missing population would
 * corrupt later population-based sizing — surface both here instead.
 */
function assertMarkers(markers: readonly CityMarker[]): void {
  if (markers.length === 0) {
    throw new Error('CityLayer requires at least one city marker; received an empty array.')
  }
  markers.forEach((m, i) => {
    if (!m.name) {
      throw new Error(`CityLayer: marker at index ${i} is missing a name.`)
    }
    for (const [field, value] of [
      ['x', m.x],
      ['y', m.y],
      ['lon', m.lon],
      ['lat', m.lat],
      ['population', m.population],
    ] as const) {
      if (!Number.isFinite(value)) {
        throw new Error(`CityLayer: marker "${m.name}" has a non-finite ${field} (${value}).`)
      }
    }
  })
}

/**
 * Renders the city markers — the Lucide `building-2` icon plus a name label per
 * city — as a single self-contained layer. It's the same glyph the toolbar shows
 * for the cities toggle, so the control and what it toggles read as one thing.
 *
 * Everything lives in world space so it pans and zooms with the map, but the
 * icons and labels are re-scaled on every zoom change so they render at a
 * *constant on-screen size* (like the coastline hairline) instead of ballooning
 * or vanishing as the player zooms.
 */
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
      throw new Error(
        `CityLayer: texture "${CITY_ICON_TEXTURE}" is missing — call CityLayer.preload(scene) in the scene's preload() before constructing the layer.`,
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
          // Rasterise at device resolution so labels stay crisp on HiDPI displays.
          resolution: DPR,
        })
        // Anchor bottom-centre so the label sits above its city, centred on the icon.
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.cityLabels),
    )

    // Draw once at the current zoom so the layer is correct before any input.
    this.onZoomChanged(scene.cameras.main.zoom)
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
    if (!Number.isFinite(zoom) || zoom <= 0) {
      throw new Error(`CityLayer.onZoomChanged: zoom must be a positive finite number, got ${zoom}.`)
    }

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
