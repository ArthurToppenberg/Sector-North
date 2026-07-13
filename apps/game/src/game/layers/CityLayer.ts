import Phaser from 'phaser'
import { makeFail, type Fail } from '../fail'
import cityIconRaw from 'lucide-static/icons/building-2.svg?raw'
import { DPR, CITY, DEPTH } from '../config'
import { screenPxToWorld } from '../units'
import { iconDataUri } from '../svgIcon'
import {
  assertZoom,
  assertMarkers,
  createHitZone,
  setHitZonesInteractive,
  sizeHitZones,
  createMarkerLabel,
  type SelectHandler,
  type WorldLayer,
  type ZoomReactive,
  type ToggleableLayer,
} from './helpers'

const CITY_ICON_TEXTURE = 'city-icon'

const fail: Fail = makeFail('game/CityLayer')

export interface CityMarker {
  readonly name: string
  readonly x: number
  readonly y: number
  readonly lon: number
  readonly lat: number
  readonly population: number
}

/** Renders city markers (a building-2 icon + name label per city) as a self-contained layer. */
export class CityLayer implements WorldLayer, ZoomReactive, ToggleableLayer {
  private readonly scene: Phaser.Scene
  private readonly markers: readonly CityMarker[]
  /** One world-space icon Image per city; re-scaled on zoom to hold screen size. */
  private readonly icons: Phaser.GameObjects.Image[]
  /** One world-space Text label per city; re-positioned/re-scaled on zoom. */
  private readonly labels: Phaser.GameObjects.Text[]
  /** One invisible interactive hit target per city, for click-to-open. */
  private readonly hitZones: Phaser.GameObjects.Zone[]
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

  constructor(scene: Phaser.Scene, markers: readonly CityMarker[], onSelect: SelectHandler) {
    assertMarkers(markers, fail, 'city', (m) => {
      if (!Number.isFinite(m.population)) fail(`marker ${m.name} has a non-finite population (${m.population})`)
    })
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
      createMarkerLabel(
        scene,
        m.x,
        m.y,
        m.name,
        { fontWeight: CITY.labelFontWeight, screenSize: CITY.labelScreenSize, color: CITY.labelColor },
        DEPTH.cityLabels,
      ),
    )

    this.hitZones = markers.map((m, i) => createHitZone(scene, m.x, m.y, DEPTH.cityDots, i, onSelect))

    this.onZoomChanged(scene.cameras.main.zoom)
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [...this.icons, ...this.labels, ...this.hitZones]
  }

  /**
   * Show or hide the whole city layer. This is the master toggle driven by the
   * HUD toolbar; the actual on-screen visibility of the name labels is still
   * gated by the per-zoom reveal (`CITY.labelRevealZoom`), so re-showing the
   * layer while zoomed out keeps the names hidden until the player zooms in.
   */
  setVisible(visible: boolean): void {
    this.layerVisible = visible
    setHitZonesInteractive(this.hitZones, visible)
    this.onZoomChanged(this.scene.cameras.main.zoom)
  }

  /**
   * Re-scale the icons and re-place/scale the labels so each renders at a fixed
   * on-screen size regardless of camera zoom, and apply the per-zoom label reveal
   * (names appear only at/above `CITY.labelRevealZoom`). Cheap — a handful of
   * cities — so it runs on every zoom change.
   */
  onZoomChanged(zoom: number): void {
    assertZoom(zoom, fail)

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
    sizeHitZones(this.hitZones, CITY.hitTargetScreenSize, zoom)
  }
}
