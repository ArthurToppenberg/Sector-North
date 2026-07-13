import Phaser from 'phaser'
import { makeFail, type Fail } from '../fail'
import { WAYPOINT, DEPTH } from '../config'
import { screenPxToWorld } from '../units'
import { assertZoom, type WorldLayer, type ToggleableLayer } from './helpers'

const fail: Fail = makeFail('game/WaypointLayer')

/** One brained aircraft's planned route, already projected to world pixels. */
export interface WaypointRoute {
  readonly aircraftId: number
  readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>
}

export class WaypointLayer implements WorldLayer, ToggleableLayer {
  private readonly gfx: Phaser.GameObjects.Graphics
  private lastSignature = ''

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(DEPTH.waypointRoutes)
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx]
  }

  setVisible(visible: boolean): void {
    this.gfx.setVisible(visible)
  }

  draw(routes: readonly WaypointRoute[], zoom: number): void {
    assertZoom(zoom, fail)
    for (const route of routes) {
      if (route.points.length === 0) fail(`route for aircraft ${route.aircraftId} has no points`)
      for (const p of route.points) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
          fail(`route for aircraft ${route.aircraftId} has a non-finite point (${p.x}, ${p.y})`)
        }
      }
    }

    // Keyed on the actual point coordinates, not just aircraft ids, so a
    // future brain that moves its waypoints would still repaint correctly
    // instead of relying on today's "routes are immutable per aircraft" holding
    // forever as an undocumented, unenforced assumption.
    const signature = `${zoom}|${routes.map((r) => `${r.aircraftId}:${r.points.map((p) => `${p.x},${p.y}`).join(';')}`).join('|')}`
    if (signature === this.lastSignature) return
    this.lastSignature = signature

    const radius = screenPxToWorld(WAYPOINT.circleRadiusScreen, zoom)
    const lineWidth = screenPxToWorld(WAYPOINT.lineScreenWidth, zoom)

    this.gfx.clear()
    this.gfx.lineStyle(lineWidth, WAYPOINT.color, WAYPOINT.alpha)
    for (const route of routes) {
      for (let i = 1; i < route.points.length; i++) {
        this.gfx.lineBetween(route.points[i - 1].x, route.points[i - 1].y, route.points[i].x, route.points[i].y)
      }
      for (const p of route.points) this.gfx.strokeCircle(p.x, p.y, radius)
    }
  }
}
