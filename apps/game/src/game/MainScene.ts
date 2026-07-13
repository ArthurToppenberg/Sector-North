import Phaser from 'phaser'
import { loadBoundaries, BOUNDARY_ASSETS, PROJECTION_FRAME_ASSETS } from '../map/geojson'
import { loadMajorCities, CITIES_ASSET } from '../map/cities'
import { loadAirports, AIRPORTS_ASSET } from '../map/airports'
import { loadRadars, RADARS_ASSET } from '../map/radars'
import { clusterByProximity, resolveColocationLabels, COLOCATION_RADIUS_KM } from '../map/colocate'
import { projectToPixels, type Projector } from '../map/project'
import { AircraftSim } from '../map/aircraft'
import { DPR, MAP, APP_READY_EVENT, CAMERA_CENTER_BOUNDS, CAMERA_INITIAL_CENTER, IS_LOCALHOST } from './config'
import { GridLayer } from './layers/GridLayer'
import { CoastlineLayer } from './layers/CoastlineLayer'
import { CityLayer } from './layers/CityLayer'
import { AirportLayer } from './layers/AirportLayer'
import { RadarLayer } from './layers/RadarLayer'
import { RadarSweepLayer } from './layers/RadarSweepLayer'
import { PlaneLayer } from './layers/PlaneLayer'
import { WaypointLayer, type WaypointRoute } from './layers/WaypointLayer'
import { CameraController, type CenterBounds } from './camera/CameraController'
import { cameraWorldView } from './camera/worldView'
import { DebugHud } from './hud/DebugHud'
import { Toolbar } from './hud/Toolbar'
import { InfoWindowManager } from './hud/InfoWindowManager'
import { ConsoleWindow } from './hud/ConsoleWindow'
import { Subwoofer, SUBWOOFER_IMAGE_KEY, SUBWOOFER_AUDIO_KEY } from './hud/subwoofer'
import { preloadRadarImages } from './radarImages'
import { preloadCityImages } from './cityImages'
import {
  buildColocationInputs,
  buildCityMarkers,
  buildAirportMarkers,
  buildRadarMarkers,
  buildRadarSweepMarkers,
} from './markerBuilders'
import { cityWindowContent, radarWindowContent } from './windowContent'
import { registerSceneCommands } from './sceneCommands'
import { log } from '../log/logger'
import subwooferImageUrl from './assets/subwoofer/subwoofer.webp?url'
import subwooferAudioUrl from './assets/subwoofer/bass.mp3?url'

/** The dev toolbar is the second `Toolbar` row, stacked under the main one (row 0). */
const DEV_TOOLBAR_ROW_INDEX = 1

export class MainScene extends Phaser.Scene {
  private gridLayer!: GridLayer
  // Held as a field (unlike the city/airport/radar marker layers, which stay
  // locals in `create`) because it animates on the update tick — see `update`.
  private radarSweepLayer!: RadarSweepLayer
  // Aircraft simulation + its contact-blip renderer. Held as fields (like the
  // radar sweep) because both advance on the update tick; the projector is kept
  // to turn each aircraft's live lon/lat into world pixels every frame.
  private sim!: AircraftSim
  private planeLayer!: PlaneLayer
  // Debug chrome: the dev toolbar and the waypoint-route overlay it toggles.
  // Always constructed so `/dev-tools` can reveal it anywhere; shown by default
  // only on localhost (see `setDevToolsVisible`).
  private waypointLayer!: WaypointLayer
  private devToolbar!: Toolbar
  private waypointsVisible = false
  private devToolsVisible = IS_LOCALHOST
  // Reprojecting every brained aircraft's route is wasted work on frames where
  // the set of brained aircraft hasn't changed (routes are immutable per
  // aircraft) — cache by that id signature so `updateAircraft` only reprojects
  // when it actually differs, not on every frame the overlay happens to be on.
  private waypointRoutesCache: WaypointRoute[] = []
  private lastWaypointAircraftIds = ''
  private project!: Projector
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
    // City + radar site photos, shown in each marker's detail window (opened on
    // click in `create`), so load them before then. Cities all have a photo; only
    // some radar sites do (the rest show the "NO IMAGE" placeholder).
    preloadCityImages(this)
    preloadRadarImages(this)

    for (const { name, url } of BOUNDARY_ASSETS) {
      this.load.json(this.boundaryCacheKey(name), url)
    }
    this.load.json(CITIES_ASSET.cacheKey, CITIES_ASSET.url)
    this.load.json(AIRPORTS_ASSET.cacheKey, AIRPORTS_ASSET.url)
    this.load.json(RADARS_ASSET.cacheKey, RADARS_ASSET.url)

    this.load.image(SUBWOOFER_IMAGE_KEY, subwooferImageUrl)
    this.load.audio(SUBWOOFER_AUDIO_KEY, subwooferAudioUrl)
  }

  create() {
    const getJson = (name: string) => this.cache.json.get(this.boundaryCacheKey(name))
    const geometry = loadBoundaries(getJson)
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
    this.project = projected.project

    const poiInputs = buildColocationInputs(airports, radars)
    const poiClusters = clusterByProximity(poiInputs, COLOCATION_RADIUS_KM)
    const initialLabels = resolveColocationLabels(poiInputs, poiClusters, poiInputs.map(() => true))

    this.gridLayer = new GridLayer(this, {
      pixelsPerKm: projected.pixelsPerKm,
      origin: { x: projected.bounds.x, y: projected.bounds.y },
    })
    const coastline = new CoastlineLayer(this, projected.polygons)
    // Clicking a city or radar opens a fresh detail window. The layer reports the
    // marker index; the scene owns the records and the window manager, so it maps
    // one to the other. The layers stay decoupled from the window itself.
    this.infoWindows = new InfoWindowManager(this, this.cameras.main)
    const cityLayer = new CityLayer(this, buildCityMarkers(cities, projected.project), (index) => {
      this.infoWindows.toggle(`city:${index}`, cityWindowContent(cities[index]))
    })
    const airportLayer = new AirportLayer(
      this,
      buildAirportMarkers(airports, projected.project, initialLabels.slice(0, airports.length)),
    )
    const radarLayer = new RadarLayer(
      this,
      buildRadarMarkers(radars, projected.project, initialLabels.slice(airports.length)),
      (index) => {
        this.infoWindows.toggle(`radar:${index}`, radarWindowContent(radars[index]))
      },
    )
    this.consoleWindow = new ConsoleWindow(this, () => this.setConsoleOpen(false))
    this.subwoofer = new Subwoofer(this)
    this.radarSweepLayer = new RadarSweepLayer(
      this,
      buildRadarSweepMarkers(radars, projected.project),
      projected.pixelsPerKm,
    )
    // Air traffic: the sim flies aircraft in the background whether or not they
    // are seen; the plane layer only ever draws the contact blips the radar
    // sweep reveals (GPS is the source of truth — see `update`).
    this.sim = new AircraftSim()
    this.planeLayer = new PlaneLayer(this)
    registerSceneCommands({
      sim: this.sim,
      planeLayer: this.planeLayer,
      subwoofer: this.subwoofer,
      setDevToolsVisible: (visible) => this.setDevToolsVisible(visible),
    })

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
    // Blips are radar returns, so they belong to the radar picture — toggled
    // with it. With the radars off the sweep freezes, so no new contacts appear
    // regardless; hiding the layer also drops any still-fading blips at once.
    this.planeLayer.setVisible(radarsVisible)
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
          this.planeLayer.setVisible(active)
          applyColocationLabels()
        },
      },
      {
        id: 'developer',
        initialActive: this.consoleOpen,
        onToggle: (active) => this.setConsoleOpen(active),
      },
    ])

    this.waypointLayer = new WaypointLayer(this)
    this.waypointLayer.setVisible(this.waypointsVisible)
    this.devToolbar = new Toolbar(
      this,
      [
        {
          id: 'waypoints',
          initialActive: this.waypointsVisible,
          onToggle: (active) => this.setWaypointsVisible(active),
        },
      ],
      DEV_TOOLBAR_ROW_INDEX,
    )
    this.devToolbar.setVisible(this.devToolsVisible)

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
        ...this.planeLayer.objects,
        ...this.waypointLayer.objects,
        ...cityLayer.objects,
        ...airportLayer.objects,
        ...radarLayer.objects,
      ],
      [
        ...this.debugHud.objects,
        ...this.toolbar.objects,
        ...this.devToolbar.objects,
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

  private setConsoleOpen(open: boolean): void {
    if (open === this.consoleOpen) return
    this.consoleOpen = open
    this.consoleWindow.setVisible(open)
    this.toolbar.setActive('developer', open)
    this.cameraController.setKeyboardPanEnabled(!open)
  }

  /**
   * The single funnel for the waypoint-overlay flag, mirroring `setConsoleOpen`:
   * the scene field, the dev-toolbar button's glyph, and the layer's visibility
   * are kept in sync from this one place, whether the change came from the
   * toolbar press (`onToggle`) or from hiding the toolbar itself.
   */
  private setWaypointsVisible(active: boolean): void {
    if (active === this.waypointsVisible) return
    this.waypointsVisible = active
    this.waypointLayer.setVisible(active)
    this.devToolbar.setActive('waypoints', active)
  }

  private setDevToolsVisible(visible: boolean): void {
    if (visible === this.devToolsVisible) return
    this.devToolsVisible = visible
    this.devToolbar.setVisible(visible)
    if (!visible) {
      // Hiding the toolbar must also drop the overlay it controls — otherwise the
      // waypoint routes would linger with no visible control left to turn them off.
      this.setWaypointsVisible(false)
    }
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
    this.devToolbar.reposition()
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

  /**
   * Advance the background air traffic and refresh its contact blips. Must run
   * after `radarSweepLayer.update` each frame: the sweep advances its angles
   * there, and detection reads the arc swept this frame. Aircraft are projected
   * from their live lon/lat here (GPS is the source of truth), so a blip is
   * painted at the plane's true ground position at the moment the sweep hit it.
   */
  private updateAircraft(deltaSec: number, zoom: number): number {
    // Fixed-tick stepping (the determinism principle): the sim banks the frame
    // delta and consumes it in whole SIM_TICK_SEC ticks, so world state never
    // depends on how the render loop slices time.
    const ticks = this.sim.advance(deltaSec)
    const targets = this.sim.all.map((a) => {
      const [x, y] = this.project(a.lon, a.lat)
      return { x, y, headingDeg: a.headingDeg, speedKmh: a.speedKmh }
    })
    // A sweep either refreshes a contact (plane still there) or clears it (moved
    // on / gone): expire the slice the hand just passed, then re-add whatever it
    // detects there. Order matters — a detected target sits in the swept slice, so
    // it must be re-added after the expiry, not before.
    this.planeLayer.removeWhere((c) => this.radarSweepLayer.isSwept(c.x, c.y))
    this.planeLayer.addContacts(this.radarSweepLayer.detectSweptTargets(targets))
    this.planeLayer.draw(zoom)

    if (this.waypointsVisible) {
      const brainedIds = this.sim.all.filter((ac) => this.sim.brainOf(ac.id) !== undefined).map((ac) => ac.id)
      const aircraftIds = brainedIds.join(',')
      if (aircraftIds !== this.lastWaypointAircraftIds) {
        this.lastWaypointAircraftIds = aircraftIds
        this.waypointRoutesCache = brainedIds.map((id) => {
          const waypoints = this.sim.brainOf(id)?.waypoints
          if (!waypoints) throw new Error(`[MainScene] brain for aircraft ${id} vanished mid-frame`)
          return {
            aircraftId: id,
            points: waypoints.map((wp) => {
              const [x, y] = this.project(wp.lon, wp.lat)
              return { x, y }
            }),
          }
        })
      }
      this.waypointLayer.draw(this.waypointRoutesCache, zoom)
    }
    return ticks
  }

  update(_time: number, deltaMs: number) {
    const deltaSec = deltaMs / 1000
    // Apply any held-key panning first, then react to the resulting camera state.
    this.cameraController.update(deltaSec)

    const cam = this.cameras.main

    // Radar sweeps animate on real elapsed time, so they must advance every frame —
    // including while the camera is idle. Run before the camera-dirty early-out below.
    // The view centre (from the canonical live-scroll helper, not the render-lagged
    // cam.worldView) picks the single radar to sweep — the one whose coverage the
    // centre is under (see RadarSweepLayer.selectSweepIndex).
    const view = cameraWorldView(cam)
    this.radarSweepLayer.update(deltaSec, cam.zoom, view.centerX, view.centerY)
    // The tps sample must also run every frame — it measures real ticks per real
    // second, so it cannot sit behind the camera-dirty early-out below.
    this.debugHud.sampleTicks(deltaSec, this.updateAircraft(deltaSec, cam.zoom))

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
