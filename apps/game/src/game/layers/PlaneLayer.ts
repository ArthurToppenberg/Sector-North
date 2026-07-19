import Phaser from 'phaser'
import { makeFail, type Fail } from '../fail'
import { PLANE, DEPTH } from '../config'
import { screenPxToWorld } from '../units'
import type { WorldLayer } from './helpers'

const DEG2RAD = Math.PI / 180

/** A radar contact projected for drawing: a world-pixel point plus the plane's velocity when the sweep last saw it. */
export interface Contact {
  x: number
  y: number
  /** Compass heading in degrees: 0 = north, 90 = east. */
  headingDeg: number
  speedKmh: number
}

const fail: Fail = makeFail('game/PlaneLayer')

/**
 * Draws the radar contact picture. The contacts themselves are world state owned
 * by `RadarField` (`src/map/radarField.ts`) — snapshots painted where a sweep
 * last crossed a plane, held at full brightness (no fade) until the sweep
 * revisits them. This layer is a pure presenter: each frame it receives the
 * already-projected contact list and redraws it. Every-frame / animated layer
 * (like `RadarSweepLayer`): its geometry is world-space so contacts stay glued
 * to the ground as the camera pans/zooms, with only the on-screen icon size
 * re-derived per frame to stay constant.
 */
export class PlaneLayer implements WorldLayer {
  private readonly gfx: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(DEPTH.planeBlips)
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx]
  }

  /**
   * Redraw every contact as a hollow circle plus a speed-proportional velocity
   * line. Dynamic-content layer: positions are validated per draw — a non-finite
   * value means the projection upstream failed, so refuse to draw it.
   */
  draw(contacts: readonly Contact[], zoom: number): void {
    for (const c of contacts) {
      if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) {
        fail(`contact has a non-finite position (${c.x}, ${c.y})`)
      }
      if (!Number.isFinite(c.headingDeg)) fail(`contact has a non-finite heading: ${c.headingDeg}`)
      if (!Number.isFinite(c.speedKmh) || c.speedKmh < 0) fail(`contact has an invalid speed: ${c.speedKmh}`)
    }

    // Clamp the zoom used for sizing: at/above the lock the icon is constant on
    // screen; below it the icon is world-anchored and scales with the terrain.
    const sizeZoom = Math.max(zoom, PLANE.sizeLockZoom)
    const radius = screenPxToWorld(PLANE.iconRadiusScreen, sizeZoom)
    const iconLineWidth = screenPxToWorld(PLANE.iconLineScreenWidth, sizeZoom)
    const vectorLineWidth = screenPxToWorld(PLANE.vectorLineScreenWidth, sizeZoom)

    this.gfx.clear()
    for (const contact of contacts) {
      // Heading → pixel direction: north (0°) is up (−y, screen Y grows down),
      // east (90°) is +x. Exact at the projection's mean latitude and within a
      // few percent across this map's span, so no projector is needed here.
      const headingRad = contact.headingDeg * DEG2RAD
      const forwardX = Math.sin(headingRad)
      const forwardY = -Math.cos(headingRad)

      // The vector starts at the rim, not the centre, so the circle stays hollow;
      // a contact slow enough for the tip to fall inside the rim shows no vector.
      const length = screenPxToWorld(PLANE.vectorScreenPxPerKmh * contact.speedKmh, sizeZoom)
      if (length > radius) {
        this.gfx.lineStyle(vectorLineWidth, PLANE.blipColor, PLANE.blipAlpha)
        this.gfx.lineBetween(
          contact.x + forwardX * radius,
          contact.y + forwardY * radius,
          contact.x + forwardX * length,
          contact.y + forwardY * length,
        )
      }

      this.gfx.lineStyle(iconLineWidth, PLANE.blipColor, PLANE.blipAlpha)
      this.gfx.strokeCircle(contact.x, contact.y, radius)
    }
  }
}
