import Phaser from 'phaser'
import { loadBoundaries, BOUNDARY_ASSETS, PROJECTION_FRAME_ASSETS } from '../map/geojson'
import { loadMajorCities, CITIES_ASSET, type City } from '../map/cities'
import { loadAirports, AIRPORTS_ASSET, type AirportTier, type Airport } from '../map/airports'
import { loadRadars, RADARS_ASSET, type Radar } from '../map/radars'
import {
  clusterByProximity,
  resolveColocationLabels,
  COLOCATION_RADIUS_KM,
  type ColocationInput,
  type ColocationLabel,
} from '../map/colocate'
import { projectToPixels, type Projector } from '../map/project'
import { DPR, MAP, APP_READY_EVENT, CAMERA_CENTER_BOUNDS, CAMERA_INITIAL_CENTER } from './config'
import { GridLayer } from './GridLayer'
import { CoastlineLayer } from './CoastlineLayer'
import { CityLayer, type CityMarker } from './CityLayer'
import { AirportLayer, type AirportMarker } from './AirportLayer'
import { RadarLayer, type RadarMarker } from './RadarLayer'
import { RadarSweepLayer, type RadarSweepMarker } from './RadarSweepLayer'
import { CameraController, type CenterBounds } from './CameraController'
import { cameraWorldView } from './camera'
import { DebugHud } from './DebugHud'
import { Toolbar } from './Toolbar'
import { type InfoWindowContent } from './InfoWindow'
import { InfoWindowManager } from './InfoWindowManager'
import { ConsoleWindow } from './ConsoleWindow'
import { Subwoofer, SUBWOOFER_IMAGE_KEY, SUBWOOFER_AUDIO_KEY } from './subwoofer'
import { preloadRadarImages, radarImageAsset } from './radarImages'
import { log } from '../log/logger'
import { commands } from '../commands/registry'
import subwooferImageUrl from './assets/subwoofer/subwoofer.webp?url'
import subwooferAudioUrl from './assets/subwoofer/bass.mp3?url'

const AIRPORT_LABEL_PRIORITY: Record<AirportTier, number> = { military: 0, major: 1, minor: 2 }
const RADAR_LABEL_PRIORITY = 3

export class MainScene extends Phaser.Scene {
  private gridLayer!: GridLayer
  // Held as a field (unlike the city/airport/radar marker layers, which stay
  // locals in `create`) because it animates on the update tick — see `update`.
  private radarSweepLayer!: RadarSweepLayer
  private cameraController!: CameraController
  private debugHud!: DebugHud
  private toolbar!: Toolbar
  private infoWindows!: InfoWindowManager
  private consoleWindow!: ConsoleWindow
  private subwoofer!: Subwoofer
  /** Whether the developer console is open; toggled by the toolbar and the "/" key. */
  private consoleOpen = false
  private uiCamera!: Phaser.Cameras.Scene2D.Camera

  // Camera state from the previous frame, so `update` can skip viewport-reactive
  // work while the camera is idle (the common case). NaN forces a first-frame draw.
  private lastScrollX = Number.NaN
  private lastScrollY = Number.NaN
  private lastZoom = Number.NaN

  constructor() {
    super('MainScene')
  }

  private boundaryCacheKey(name: string): string {
    return `boundary:${name}`
  }

  preload() {
    // Rasterise the SVG glyphs into textures before `create` builds the toolbar
    // buttons and the city markers from them.
    Toolbar.preload(this)
    CityLayer.preload(this)
    // Radar site photos (only the sites we have a usable photo for), shown in each
    // radar's detail window (opened on click in `create`), so load them before then.
    preloadRadarImages(this)

    // Fetch the country boundaries. Phaser's loader parses each into the JSON
    // cache before `create` runs; we read + validate them there.
    for (const { name, url } of BOUNDARY_ASSETS) {
      this.load.json(this.boundaryCacheKey(name), url)
    }
    // The city/airport/radar datasets ship the same way — standalone `?url`
    // files fetched into the JSON cache here, validated in `create`.
    this.load.json(CITIES_ASSET.cacheKey, CITIES_ASSET.url)
    this.load.json(AIRPORTS_ASSET.cacheKey, AIRPORTS_ASSET.url)
    this.load.json(RADARS_ASSET.cacheKey, RADARS_ASSET.url)

    // The `/subwoofer` easter-egg photo + sound (see `Subwoofer`).
    this.load.image(SUBWOOFER_IMAGE_KEY, subwooferImageUrl)
    this.load.audio(SUBWOOFER_AUDIO_KEY, subwooferAudioUrl)
  }

  create() {
    // Load + validate the world data (each throws loudly on anything unexpected).
    const getJson = (name: string) => this.cache.json.get(this.boundaryCacheKey(name))
    const geometry = loadBoundaries(getJson)
    // The projection/zoom is pinned to a fixed frame (the original Denmark-centred
    // set), so boundaries added purely for context don't rescale the map.
    const frame = loadBoundaries(getJson, PROJECTION_FRAME_ASSETS)
    const cities = loadMajorCities(this.cache.json.get(CITIES_ASSET.cacheKey))
    const airports = loadAirports(this.cache.json.get(AIRPORTS_ASSET.cacheKey))
    const radars = loadRadars(this.cache.json.get(RADARS_ASSET.cacheKey))
    log.info(`World data loaded: ${cities.length} cities, ${airports.length} airfields, ${radars.length} radar sites`)

    const { width, height } = this.scale
    const projected = projectToPixels(
      geometry,
      {
        width,
        height,
        padding: MAP.padding * DPR,
      },
      frame,
    )

    const poiInputs = this.buildColocationInputs(airports, radars)
    const poiClusters = clusterByProximity(poiInputs, COLOCATION_RADIUS_KM)
    // Initial labels: everything visible.
    const initialLabels = resolveColocationLabels(poiInputs, poiClusters, poiInputs.map(() => true))

    const cityMarkers = this.buildCityMarkers(cities, projected.project)
    const airportMarkers = this.buildAirportMarkers(
      airports,
      projected.project,
      initialLabels.slice(0, airports.length),
    )
    const radarMarkers = this.buildRadarMarkers(
      radars,
      projected.project,
      initialLabels.slice(airports.length),
    )

    this.gridLayer = new GridLayer(this, {
      pixelsPerKm: projected.pixelsPerKm,
      origin: { x: projected.bounds.x, y: projected.bounds.y },
    })
    const coastline = new CoastlineLayer(this, projected.polygons)
    const cityLayer = new CityLayer(this, cityMarkers)
    const airportLayer = new AirportLayer(this, airportMarkers)
    // Clicking a radar opens a fresh detail window. The layer reports the site
    // index; the scene owns the radar records and the window manager, so it maps
    // one to the other.
    this.infoWindows = new InfoWindowManager(this, this.cameras.main)
    const radarLayer = new RadarLayer(this, radarMarkers, (index) => {
      this.infoWindows.toggle(`radar:${index}`, this.radarWindowContent(radars[index]))
    })
    // The developer console: a HUD panel that surfaces the shared logger's output.
    // Created here (before `setupCameras`) so its objects join the UI-camera list
    // below. Closing it via its own button flips the toolbar's developer glyph back.
    this.consoleWindow = new ConsoleWindow(this, () => this.setConsoleOpen(false))
    // Easter-egg command wired here (not in the pure registry) because it needs the
    // scene to play audio and draw the overlay; it captures `subwoofer` by closure.
    this.subwoofer = new Subwoofer(this)
    commands.register({
      name: 'subwoofer',
      description: 'Drop the bass.',
      run: () => {
        this.subwoofer.trigger()
        return 'BWAAAAH'
      },
    })
    this.radarSweepLayer = new RadarSweepLayer(
      this,
      this.buildRadarSweepMarkers(radars, projected.project),
      projected.pixelsPerKm,
    )
    // Cities, airports and radars are shown by default; the toolbar toggles hide
    // them. One variable per layer feeds both the layer's start visibility and the
    // toolbar's initial state so the glyph and the actual visibility can't drift.
    // The airport/radar flags stay live because the co-located "+N" counts depend
    // on which of those layers are currently shown.
    const citiesVisible = true
    let airportsVisible = true
    let radarsVisible = true
    cityLayer.setVisible(citiesVisible)
    airportLayer.setVisible(airportsVisible)
    radarLayer.setVisible(radarsVisible)
    this.radarSweepLayer.setVisible(radarsVisible)
    // The console starts closed (constructor already hid it); it is opened by the
    // developer toolbar button or the "/" key, both routed through `setConsoleOpen`.
    this.debugHud = new DebugHud(this)

    const applyColocationLabels = () => {
      const visible = [...airports.map(() => airportsVisible), ...radars.map(() => radarsVisible)]
      const resolved = resolveColocationLabels(poiInputs, poiClusters, visible)
      airportLayer.setLabels(resolved.slice(0, airports.length))
      radarLayer.setLabels(resolved.slice(airports.length))
    }

    this.toolbar = new Toolbar(this, [
      {
        id: 'cities',
        initialActive: citiesVisible,
        onToggle: (active) => {
          cityLayer.setVisible(active)
        },
      },
      {
        id: 'airports',
        initialActive: airportsVisible,
        onToggle: (active) => {
          airportsVisible = active
          airportLayer.setVisible(active)
          applyColocationLabels()
        },
      },
      {
        id: 'radars',
        initialActive: radarsVisible,
        onToggle: (active) => {
          radarsVisible = active
          radarLayer.setVisible(active)
          this.radarSweepLayer.setVisible(active)
          applyColocationLabels()
        },
      },
      {
        id: 'developer',
        initialActive: this.consoleOpen,
        onToggle: (active) => this.setConsoleOpen(active),
      },
    ])

    // "/" opens the console. Keyboard must exist (CameraController asserts the
    // same), so fail loudly rather than silently drop the shortcut. Only opens: once
    // the console is open the "/" is a command prefix the console's input captures,
    // so it must not toggle the panel shut. Close it with its × button, the toolbar
    // developer glyph, or Escape (handled by `ConsoleWindow`).
    const keyboard = this.input.keyboard
    if (!keyboard) throw new Error('[MainScene] keyboard input unavailable')
    keyboard.on('keydown-FORWARD_SLASH', (event: KeyboardEvent) => {
      if (this.consoleOpen) return
      event.preventDefault()
      this.setConsoleOpen(true)
    })

    const onZoomChanged = (zoom: number) => {
      coastline.onZoomChanged(zoom)
      cityLayer.onZoomChanged(zoom)
      airportLayer.onZoomChanged(zoom)
      radarLayer.onZoomChanged(zoom)
    }
    const [initX, initY] = projected.project(CAMERA_INITIAL_CENTER.lon, CAMERA_INITIAL_CENTER.lat)
    this.cameraController = new CameraController(this, {
      centerBounds: this.projectCenterBounds(projected.project),
      initialCenter: { x: initX, y: initY },
      onZoomChanged,
    })

    this.setupCameras(
      [
        ...this.gridLayer.objects,
        ...coastline.objects,
        ...this.radarSweepLayer.objects,
        ...cityLayer.objects,
        ...airportLayer.objects,
        ...radarLayer.objects,
      ],
      [
        ...this.debugHud.objects,
        ...this.toolbar.objects,
        ...this.consoleWindow.objects,
        ...this.subwoofer.objects,
      ],
    )

    // Draw the grid once now that the camera is framed on the country; thereafter
    // `update` keeps it in sync with every camera move.
    this.gridLayer.redraw(this.cameras.main)

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this)

    // World is projected and every asset has loaded — signal boot completion so
    // `main.ts` can tear down the loading indicator.
    log.info('Scene ready')
    this.game.events.emit(APP_READY_EVENT)
  }

  /**
   * Single path for opening/closing the console, so the window, the toolbar glyph,
   * and the "/" key never drift. `Toolbar.setActive` is a no-op when the glyph is
   * already in the target state, so routing a toolbar press back through here is safe.
   * While the console is open its input row captures typing, so the camera's WASD/arrow
   * pan is suspended — otherwise typing a command would also drive the map.
   */
  private setConsoleOpen(open: boolean): void {
    if (open === this.consoleOpen) return
    this.consoleOpen = open
    this.consoleWindow.setVisible(open)
    this.toolbar.setActive('developer', open)
    this.cameraController.setKeyboardPanEnabled(!open)
  }

  private buildColocationInputs(
    airports: readonly Airport[],
    radars: readonly Radar[],
  ): ColocationInput[] {
    return [
      ...airports.map((a) => ({ name: a.name, lon: a.lon, lat: a.lat, priority: AIRPORT_LABEL_PRIORITY[a.tier] })),
      ...radars.map((r) => ({ name: r.name, lon: r.lon, lat: r.lat, priority: RADAR_LABEL_PRIORITY })),
    ]
  }

  private buildCityMarkers(cities: readonly City[], project: Projector): CityMarker[] {
    return cities.map((c) => {
      const [x, y] = project(c.lon, c.lat)
      return { name: c.name, x, y, lon: c.lon, lat: c.lat, population: c.population }
    })
  }

  private buildAirportMarkers(
    airports: readonly Airport[],
    project: Projector,
    labels: readonly ColocationLabel[],
  ): AirportMarker[] {
    return airports.map((a, i) => {
      const [x, y] = project(a.lon, a.lat)
      const { label, suppressed } = labels[i]
      return { name: a.name, label, labelSuppressed: suppressed, x, y, lon: a.lon, lat: a.lat, tier: a.tier }
    })
  }

  private buildRadarMarkers(
    radars: readonly Radar[],
    project: Projector,
    labels: readonly ColocationLabel[],
  ): RadarMarker[] {
    return radars.map((r, i) => {
      const [x, y] = project(r.lon, r.lat)
      const { label, suppressed } = labels[i]
      return { name: r.name, model: r.model, label, labelSuppressed: suppressed, x, y, lon: r.lon, lat: r.lat }
    })
  }

  private radarWindowContent(radar: Radar): InfoWindowContent {
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

  private buildRadarSweepMarkers(radars: readonly Radar[], project: Projector): RadarSweepMarker[] {
    return radars.map((r) => {
      const [x, y] = project(r.lon, r.lat)
      return { name: r.name, x, y, rangeKm: r.rangeKm, updateIntervalSec: r.updateIntervalSec }
    })
  }

  /**
   * Min/max rather than assuming axis direction: x grows east, y grows south
   * (latitude flips).
   */
  private projectCenterBounds(project: Projector): CenterBounds {
    const [x1, y1] = project(CAMERA_CENTER_BOUNDS.west, CAMERA_CENTER_BOUNDS.north)
    const [x2, y2] = project(CAMERA_CENTER_BOUNDS.east, CAMERA_CENTER_BOUNDS.south)
    return {
      minX: Math.min(x1, x2),
      maxX: Math.max(x1, x2),
      minY: Math.min(y1, y2),
      maxY: Math.max(y1, y2),
    }
  }

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
    this.infoWindows.reposition()
    this.consoleWindow.reposition()
    this.subwoofer.reposition()
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

    // Radar sweeps animate on real elapsed time, so they must advance every frame —
    // including while the camera is idle. Run before the camera-dirty early-out below.
    // The view centre (from the canonical live-scroll helper, not the render-lagged
    // cam.worldView) picks the single radar to sweep — the one whose coverage the
    // centre is under (see RadarSweepLayer.selectSweepIndex).
    const view = cameraWorldView(cam)
    this.radarSweepLayer.update(deltaMs / 1000, cam.zoom, view.centerX, view.centerY)

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
