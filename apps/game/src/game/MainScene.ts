import Phaser from 'phaser'
import { loadBoundaries, BOUNDARY_ASSETS } from '../map/geojson'
import { loadMajorCities } from '../map/cities'
import { loadAirports } from '../map/airports'
import { projectToPixels } from '../map/project'
import { DPR, MAP, APP_READY_EVENT, CAMERA_CENTER_BOUNDS } from './config'
import { GridLayer } from './GridLayer'
import { CoastlineLayer } from './CoastlineLayer'
import { CityLayer, type CityMarker } from './CityLayer'
import { AirportLayer, type AirportMarker } from './AirportLayer'
import { CameraController } from './CameraController'
import { DebugHud } from './DebugHud'
import { Toolbar } from './Toolbar'

/**
 * Composition root for the game. The scene owns no rendering or input logic of
 * its own — it loads and projects the world once, then wires up the independent
 * layers (grid, coastline, cities), the camera controller, and the debug HUD,
 * and forwards the per-frame/per-event signals they need (update tick, resize,
 * zoom change).
 *
 * Zoom-reactive layers (coastline, cities) are refreshed via the camera's
 * `onZoomChanged` callback. Viewport-reactive work (the grid, which draws only
 * the visible slice, and the HUD readout) runs in `update`, but only on frames
 * where the camera actually moved — see the dirty check there.
 *
 * Everything it holds is created in `create()` and is therefore always present
 * by the time `update`/`onResize` run — hence definite-assignment fields and no
 * optional-chaining guards. A missing dependency is a bug we want to crash on.
 */
export class MainScene extends Phaser.Scene {
  /** Viewport-reactive reference grid; redrawn when the camera moves. */
  private gridLayer!: GridLayer
  /** Drives all camera movement; polled every frame for keyboard panning. */
  private cameraController!: CameraController
  /** Top-right telemetry readout; refreshed when the camera moves, re-pinned on resize. */
  private debugHud!: DebugHud
  /** Top-left toolbar (city-name toggle); re-pinned on resize. */
  private toolbar!: Toolbar
  /** Fixed UI camera that never zooms/pans, so the HUD stays a constant size. */
  private uiCamera!: Phaser.Cameras.Scene2D.Camera

  // Camera state from the previous frame, so `update` can skip viewport-reactive
  // work while the camera is idle (the common case). NaN forces a first-frame draw.
  private lastScrollX = Number.NaN
  private lastScrollY = Number.NaN
  private lastZoom = Number.NaN

  constructor() {
    super('MainScene')
  }

  /** Namespaced key under which a boundary asset lives in Phaser's JSON cache. */
  private boundaryCacheKey(name: string): string {
    return `boundary:${name}`
  }

  preload() {
    // Rasterise the SVG glyphs into textures before `create` builds the toolbar
    // buttons and the city markers from them.
    Toolbar.preload(this)
    CityLayer.preload(this)

    // Fetch the country boundaries (emitted to `dist/` via Vite `?url`, not
    // inlined). Phaser's loader parses each into the JSON cache before `create`
    // runs; we read + validate them there.
    for (const { name, url } of BOUNDARY_ASSETS) {
      this.load.json(this.boundaryCacheKey(name), url)
    }
  }

  create() {
    // Load + validate the world data (both throw loudly on anything unexpected).
    const geometry = loadBoundaries((name) =>
      this.cache.json.get(this.boundaryCacheKey(name)),
    )
    const cities = loadMajorCities()
    const airports = loadAirports()

    // Project the country once to fit the initial viewport. This establishes the
    // world scale; from here the Phaser camera owns all pan/zoom — the model is
    // never re-projected.
    const { width, height } = this.scale
    const projected = projectToPixels(geometry, {
      width,
      height,
      padding: MAP.padding * DPR,
    })

    // Place the cities in the same world space as the coastline.
    const markers: CityMarker[] = cities.map((c) => {
      const [x, y] = projected.project(c.lon, c.lat)
      // Keep the real lon/lat + population on the marker — pixels are derived,
      // GPS is the source of truth (README).
      return { name: c.name, x, y, lon: c.lon, lat: c.lat, population: c.population }
    })

    // Place the airfields in the same world space, through the same projection.
    const airportMarkers: AirportMarker[] = airports.map((a) => {
      const [x, y] = projected.project(a.lon, a.lat)
      return { name: a.name, x, y, lon: a.lon, lat: a.lat, tier: a.tier }
    })

    // World layers (drawn by the main camera) and the HUD (drawn by the UI camera).
    // The grid sits beneath everything; cells are a fixed real-world size derived
    // from the projection's pixels-per-km, anchored to the map's corner.
    this.gridLayer = new GridLayer(this, {
      pixelsPerKm: projected.pixelsPerKm,
      origin: { x: projected.bounds.x, y: projected.bounds.y },
    })
    const coastline = new CoastlineLayer(this, projected.polygons)
    const cityLayer = new CityLayer(this, markers)
    const airportLayer = new AirportLayer(this, airportMarkers)
    // Cities and airports are shown by default; the toolbar toggles hide them.
    // One literal per layer feeds both the layer's start visibility and the
    // toolbar's initial state so the glyph and the actual visibility can't drift.
    const citiesVisible = true
    const airportsVisible = true
    cityLayer.setVisible(citiesVisible)
    airportLayer.setVisible(airportsVisible)
    this.debugHud = new DebugHud(this)

    // Toolbar toggles the city and airport markers. Each button owns its on/off
    // state and only hands us the new value — the scene wires that to the layers.
    this.toolbar = new Toolbar(this, [
      { id: 'cities', initialActive: citiesVisible, onToggle: (active) => cityLayer.setVisible(active) },
      { id: 'airports', initialActive: airportsVisible, onToggle: (active) => airportLayer.setVisible(active) },
    ])

    // One place that fans a zoom change out to every zoom-reactive layer, so a new
    // layer only has to be added here rather than at each call site. (The grid is
    // viewport-reactive and redraws every frame in `update` instead.)
    const onZoomChanged = (zoom: number) => {
      coastline.onZoomChanged(zoom)
      cityLayer.onZoomChanged(zoom)
      airportLayer.onZoomChanged(zoom)
    }
    // Turn the lon/lat play area into a world-pixel box the camera centre is
    // confined to. Projecting through the same `project()` as everything else
    // keeps the play area pinned to real geography (GPS is the source of truth),
    // so it survives projection and window-size changes. Min/max rather than
    // assuming axis direction: x grows east, y grows south (latitude flips).
    const [x1, y1] = projected.project(CAMERA_CENTER_BOUNDS.west, CAMERA_CENTER_BOUNDS.north)
    const [x2, y2] = projected.project(CAMERA_CENTER_BOUNDS.east, CAMERA_CENTER_BOUNDS.south)
    this.cameraController = new CameraController(this, {
      centerBounds: {
        minX: Math.min(x1, x2),
        maxX: Math.max(x1, x2),
        minY: Math.min(y1, y2),
        maxY: Math.max(y1, y2),
      },
      onZoomChanged,
    })

    this.setupCameras(
      [...this.gridLayer.objects, ...coastline.objects, ...cityLayer.objects, ...airportLayer.objects],
      [...this.debugHud.objects, ...this.toolbar.objects],
    )

    // Draw the grid once now that the camera is framed on the country; thereafter
    // `update` keeps it in sync with every camera move.
    this.gridLayer.redraw(this.cameras.main)

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this)

    // World is projected and every asset has loaded — signal boot completion so
    // `main.ts` can tear down the loading indicator.
    this.game.events.emit(APP_READY_EVENT)
  }

  /**
   * Split rendering across two cameras so the HUD is immune to the map's
   * zoom/pan: the main camera draws only the world layers, and a separate UI
   * camera (fixed at zoom 1, no scroll) draws only the HUD. Each camera ignores
   * the other's objects so nothing double-renders.
   */
  private setupCameras(
    worldObjects: Phaser.GameObjects.GameObject[],
    hudObjects: Phaser.GameObjects.GameObject[],
  ) {
    const { width, height } = this.scale
    this.uiCamera = this.cameras.add(0, 0, width, height)
    this.cameras.main.ignore(hudObjects)
    this.uiCamera.ignore(worldObjects)
  }

  private onResize() {
    this.uiCamera.setSize(this.scale.width, this.scale.height)
    this.debugHud.reposition()
    this.toolbar.reposition()
    // A resize changes the main camera's size without moving scroll/zoom, so the
    // per-frame dirty check won't catch it. The changed width/height also shifts
    // the look-at centre (`scroll + size/2`), so re-clamp the camera back inside
    // the play area FIRST, then redraw the viewport-reactive grid and HUD from the
    // corrected camera to refill the newly exposed area with the right readout.
    this.cameraController.reclampToBounds()
    this.gridLayer.redraw(this.cameras.main)
    this.debugHud.render(this.cameras.main)
  }

  update(_time: number, deltaMs: number) {
    // Apply any held-key panning first, then react to the resulting camera state.
    this.cameraController.update(deltaMs / 1000)

    const cam = this.cameras.main
    if (cam.scrollX === this.lastScrollX && cam.scrollY === this.lastScrollY && cam.zoom === this.lastZoom) {
      // Camera hasn't moved this frame — the grid slice and HUD readout are still
      // valid, so skip the grid re-tessellation and the HUD text re-raster.
      return
    }
    this.lastScrollX = cam.scrollX
    this.lastScrollY = cam.scrollY
    this.lastZoom = cam.zoom

    // The grid only draws the visible slice, so it must follow every camera move.
    this.gridLayer.redraw(cam)
    this.debugHud.render(cam)
  }
}
