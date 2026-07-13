import Phaser from 'phaser'
import { makeFail, type Fail } from '../fail'
import { PLANE, DEPTH } from '../config'
import { screenPxToWorld } from '../units'
import type { WorldLayer, ToggleableLayer } from './helpers'

const DEG2RAD = Math.PI / 180

/** A radar contact: a world-pixel point plus the plane's velocity when the sweep last saw it. */
export interface Contact {
  x: number
  y: number
  /** Compass heading in degrees: 0 = north, 90 = east. */
  headingDeg: number
  speedKmh: number
}

const fail: Fail = makeFail('game/PlaneLayer')

/**
 * Draws radar contacts. Aircraft themselves live in the world model and are never
 * drawn directly here — the player only sees a contact where a radar sweep crossed
 * one. A contact holds its position at full brightness (no fade); it is expired by
 * `removeWhere` the moment the sweep revisits its bearing, and re-added by
 * `addContacts` only if a plane is still there — so a contact jumps forward one
 * step per revolution and vanishes once its plane has moved on. Every-frame /
 * animated layer (like `RadarSweepLayer`): its geometry is world-space so contacts
 * stay glued to the ground as the camera pans/zooms, with only the on-screen icon
 * size re-derived per frame to stay constant.
 */
export class PlaneLayer implements WorldLayer, ToggleableLayer {
  private readonly gfx: Phaser.GameObjects.Graphics
  private contacts: Contact[] = []

  constructor(scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(DEPTH.planeBlips)
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.gfx]
  }

  setVisible(visible: boolean): void {
    this.gfx.setVisible(visible)
  }

  /** Add contacts reported by the radar sweep this frame. */
  addContacts(contacts: ReadonlyArray<Contact>): void {
    for (const c of contacts) {
      if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) {
        fail(`contact has a non-finite position (${c.x}, ${c.y})`)
      }
      if (!Number.isFinite(c.headingDeg)) fail(`contact has a non-finite heading: ${c.headingDeg}`)
      if (!Number.isFinite(c.speedKmh) || c.speedKmh < 0) fail(`contact has an invalid speed: ${c.speedKmh}`)
      this.contacts.push({ x: c.x, y: c.y, headingDeg: c.headingDeg, speedKmh: c.speedKmh })
    }
  }

  /** Drop every contact matching `predicate` — used to expire the slice the sweep just passed. */
  removeWhere(predicate: (contact: Contact) => boolean): void {
    let kept = 0
    for (const contact of this.contacts) {
      if (!predicate(contact)) this.contacts[kept++] = contact
    }
    this.contacts.length = kept
  }

  /** Remove all contacts (e.g. when the aircraft are cleared). */
  clear(): void {
    this.contacts.length = 0
  }

  /** Redraw every contact as a hollow circle plus a speed-proportional velocity line. */
  draw(zoom: number): void {
    // Clamp the zoom used for sizing: at/above the lock the icon is constant on
    // screen; below it the icon is world-anchored and scales with the terrain.
    const sizeZoom = Math.max(zoom, PLANE.sizeLockZoom)
    const radius = screenPxToWorld(PLANE.iconRadiusScreen, sizeZoom)
    const iconLineWidth = screenPxToWorld(PLANE.iconLineScreenWidth, sizeZoom)
    const vectorLineWidth = screenPxToWorld(PLANE.vectorLineScreenWidth, sizeZoom)

    this.gfx.clear()
    for (const contact of this.contacts) {
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
