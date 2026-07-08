import Phaser from 'phaser'
import { loadBoundaries, BOUNDARY_ASSETS } from '../map/geojson'
import { loadMajorCities, type City } from '../map/cities'
import { loadAirports, type AirportTier, type Airport } from '../map/airports'
import { loadRadars, type Radar } from '../map/radars'
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
import { DebugHud } from './DebugHud'
import { Toolbar } from './Toolbar'

const AIRPORT_LABEL_PRIORITY: Record<AirportTier, number> = { military: 0, major: 1, minor: 2 }
const RADAR_LABEL_PRIORITY = 3

/**
 * Composition root: loads & projects the world, wires layers/camera/HUD, forwards signals.
 */
export class MainScene extends Phaser.Scene {
  private gridLayer!: GridLayer
  private radarSweepLayer!: RadarSweepLayer
  private cameraController!: CameraController
  private debugHud!: DebugHud
  private toolbar!: Toolbar
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

    // Fetch the country boundaries. Phaser's loader parses each into the JSON
    // cache before `create` runs; we read + validate them there.
    for (const { name, url } of BOUNDARY_ASSETS) {
      this.load.json(this.boundaryCacheKey(name), url)
    }
  }

  create() {
    // Load + validate the world data (each throws loudly on anything unexpected).
    const geometry = loadBoundaries((name) => this.cache.json.get(this.boundaryCacheKey(name)))
    const cities = loadMajorCities()
    const airports = loadAirports()
    const radars = loadRadars()

    const { width, height } = this.scale
    const projected = projectToPixels(geometry, {
      width,
      height,
      padding: MAP.padding * DPR,
    })

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
    const radarLayer = new RadarLayer(this, radarMarkers)
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
    this.debugHud = new DebugHud(this)

    const applyColocationLabels = () => {
      const visible = [...airports.map(() => airportsVisible), ...radars.map(() => radarsVisible)]
      const resolved = resolveColocationLabels(poiInputs, poiClusters, visible)
      airportLayer.setLabels(resolved.slice(0, airports.length))
      radarLayer.setLabels(resolved.slice(airports.length))
    }

    // Toolbar toggles the city, airport and radar markers. Each button owns its
    // on/off state and only hands us the new value — the scene wires that to the
    // layers, then re-resolves the shared labels for the new visibility.
    this.toolbar = new Toolbar(this, [
      { id: 'cities', initialActive: citiesVisible, onToggle: (active) => cityLayer.setVisible(active) },
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
    ])

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
    this.radarSweepLayer.update(deltaMs / 1000, cam.zoom)

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
