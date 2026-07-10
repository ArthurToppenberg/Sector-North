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
import { AircraftSim } from '../map/aircraft'
import { DPR, MAP, PLANE, APP_READY_EVENT, CAMERA_CENTER_BOUNDS, CAMERA_INITIAL_CENTER } from './config'
import { GridLayer } from './GridLayer'
import { CoastlineLayer } from './CoastlineLayer'
import { CityLayer, type CityMarker } from './CityLayer'
import { AirportLayer, type AirportMarker } from './AirportLayer'
import { RadarLayer, type RadarMarker } from './RadarLayer'
import { RadarSweepLayer, type RadarSweepMarker } from './RadarSweepLayer'
import { PlaneLayer } from './PlaneLayer'
import { CameraController, type CenterBounds } from './CameraController'
import { cameraWorldView } from './camera'
import { DebugHud } from './DebugHud'
import { Toolbar } from './Toolbar'
import { type InfoWindowContent } from './InfoWindow'
import { InfoWindowManager } from './InfoWindowManager'
import { ConsoleWindow } from './ConsoleWindow'
import { Subwoofer, SUBWOOFER_IMAGE_KEY, SUBWOOFER_AUDIO_KEY } from './subwoofer'
import { preloadRadarImages, radarImageAsset } from './radarImages'
import { preloadCityImages, cityImageAsset } from './cityImages'
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
  // Aircraft simulation + its contact-blip renderer. Held as fields (like the
  // radar sweep) because both advance on the update tick; the projector is kept
  // to turn each aircraft's live lon/lat into world pixels every frame.
  private sim!: AircraftSim
  private planeLayer!: PlaneLayer
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

    const poiInputs = this.buildColocationInputs(airports, radars)
    const poiClusters = clusterByProximity(poiInputs, COLOCATION_RADIUS_KM)
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
    // Clicking a city or radar opens a fresh detail window. The layer reports the
    // marker index; the scene owns the records and the window manager, so it maps
    // one to the other. The layers stay decoupled from the window itself.
    this.infoWindows = new InfoWindowManager(this, this.cameras.main)
    const cityLayer = new CityLayer(this, cityMarkers, (index) => {
      this.infoWindows.toggle(`city:${index}`, this.cityWindowContent(cities[index]))
    })
    const airportLayer = new AirportLayer(this, airportMarkers)
    const radarLayer = new RadarLayer(this, radarMarkers, (index) => {
      this.infoWindows.toggle(`radar:${index}`, this.radarWindowContent(radars[index]))
    })
    this.consoleWindow = new ConsoleWindow(this, () => this.setConsoleOpen(false))
    // Easter-egg command wired here (not in the pure registry) because it needs the
    // scene to play audio and draw the overlay; it captures `subwoofer` by closure.
    this.subwoofer = new Subwoofer(this)
    commands.register({
      name: 'subwoofer',
      description: 'Drop the bass.',
      hidden: true,
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
    // Air traffic: the sim flies aircraft in the background whether or not they
    // are seen; the plane layer only ever draws the contact blips the radar
    // sweep reveals. The projector turns each aircraft's lon/lat into world
    // pixels every frame (GPS is the source of truth — see `update`).
    this.project = projected.project
    this.sim = new AircraftSim()
    this.planeLayer = new PlaneLayer(this)
    commands.register({
      name: 'spawn-planes',
      description: 'Spawn N test aircraft flying outward from the map centre (default 8).',
      run: (args) => {
        const raw = args.trim()
        const count = raw === '' ? PLANE.defaultSpawnCount : Number.parseInt(raw, 10)
        if (!Number.isInteger(count) || count <= 0) return `Usage: /spawn-planes [positive integer]`
        for (let i = 0; i < count; i++) {
          this.sim.spawn({
            lon: CAMERA_INITIAL_CENTER.lon,
            lat: CAMERA_INITIAL_CENTER.lat,
            headingDeg: Math.random() * 360,
            speedKmh: PLANE.spawnSpeedKmh,
          })
        }
        return `Spawned ${count} aircraft (${this.sim.count} in the air).`
      },
    })
    commands.register({
      name: 'clear-planes',
      description: 'Remove all simulated aircraft.',
      run: () => {
        const removed = this.sim.clear()
        this.planeLayer.clear()
        return `Removed ${removed} aircraft.`
      },
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

  private cityWindowContent(city: City): InfoWindowContent {
    // Every current city has a photo, but a photo-less city is a valid case that
    // falls back to the placeholder — same contract as the radar builder.
    const image = cityImageAsset(city.name)
    return {
      title: city.name,
      imageTextureKey: image?.textureKey,
      imageCredit: image?.credit,
      fields: [
        { label: 'Region', value: city.region },
        { label: 'Population', value: city.population.toLocaleString('en-US') },
        { label: 'Founded', value: city.founded },
        { label: 'Notes', value: city.notes },
      ],
    }
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

  /**
   * Advance the background air traffic and refresh its contact blips. Must run
   * after `radarSweepLayer.update` each frame: the sweep advances its angles
   * there, and detection reads the arc swept this frame. Aircraft are projected
   * from their live lon/lat here (GPS is the source of truth), so a blip is
   * painted at the plane's true ground position at the moment the sweep hit it.
   */
  private updateAircraft(deltaSec: number, zoom: number) {
    this.sim.step(deltaSec)
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
    this.updateAircraft(deltaSec, cam.zoom)

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
