import Phaser from 'phaser'
import { DPR, FONT_FAMILY, CLICK_MAX_TRAVEL_SCREEN } from './config'
import { screenPxToWorld } from './units'
import type { Fail } from './fail'

/**
 * The routing seam for the two-camera setup (see CLAUDE.md): every world render
 * layer enumerates the game objects it owns so the scene can hand them to the
 * correct camera (e.g. tell the fixed UI camera to ignore them).
 */
export interface WorldLayer {
  get objects(): readonly Phaser.GameObjects.GameObject[]
}

/** Refreshed via the camera controller's onZoomChanged fan-out in MainScene. */
export interface ZoomReactive {
  onZoomChanged(zoom: number): void
}

/** Master on/off driven by the HUD toolbar. */
export interface ToggleableLayer {
  setVisible(visible: boolean): void
}

/**
 * Notified when a marker is clicked (not dragged). Carries the marker's index so
 * the scene can look up the full record for its detail window — the layer stays
 * decoupled from the window itself, same split as the toolbar's `onToggle`.
 */
export type SelectHandler = (index: number) => void

/**
 * Guard for every on-screen size derivation: a zero/NaN/negative camera zoom
 * would silently produce Infinite/NaN geometry via `screenPxToWorld`, so throw
 * with the layer's own `fail` instead.
 */
export function assertZoom(zoom: number, fail: Fail): number {
  if (!Number.isFinite(zoom) || zoom <= 0) fail(`zoom must be finite and > 0, got ${zoom}`)
  return zoom
}

/** What every projected marker carries: its name, world pixels, and the real GPS truth. */
export interface BaseMarker {
  readonly name: string
  readonly x: number
  readonly y: number
  readonly lon: number
  readonly lat: number
}

/**
 * Construction-time validation shared by the marker layers: a non-finite
 * projected x/y or lon/lat means the projection upstream failed, so it is
 * rejected with a thrown error instead of being drawn. `perMarker` carries each
 * layer's extra field checks (population, tier, model).
 */
export function assertMarkers<M extends BaseMarker>(
  markers: readonly M[],
  fail: Fail,
  kind: string,
  perMarker?: (marker: M, index: number) => void,
): void {
  if (markers.length === 0) fail(`expected at least one ${kind} marker`)
  markers.forEach((m, i) => {
    if (typeof m.name !== 'string' || m.name.length === 0) fail(`marker ${i} has no name`)
    if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) {
      fail(`marker ${m.name} has a non-finite projected position (${m.x}, ${m.y})`)
    }
    if (!Number.isFinite(m.lon) || !Number.isFinite(m.lat)) {
      fail(`marker ${m.name} has a non-finite lon/lat (${m.lon}, ${m.lat})`)
    }
    perMarker?.(m, i)
  })
}

/**
 * An invisible, interactive click target centred on a marker. Distinguishes a
 * click from a drag by pointer travel (press → release): only a near-stationary
 * release counts as a click, so a camera pan that happens to end over a marker
 * never opens its window.
 */
export function createHitZone(
  scene: Phaser.Scene,
  x: number,
  y: number,
  depth: number,
  index: number,
  onSelect: SelectHandler,
): Phaser.GameObjects.Zone {
  const zone = scene.add.zone(x, y, 1, 1).setDepth(depth).setInteractive({ useHandCursor: true })
  zone.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
    const travel = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.upX, pointer.upY)
    if (travel > CLICK_MAX_TRAVEL_SCREEN * DPR) return
    onSelect(index)
  })
  return zone
}

/**
 * A hidden layer must not be clickable — its hit targets' input is toggled
 * alongside the visuals so you can't open a window for an unseen marker.
 */
export function setHitZonesInteractive(
  zones: readonly Phaser.GameObjects.Zone[],
  enabled: boolean,
): void {
  for (const zone of zones) {
    if (enabled) zone.setInteractive({ useHandCursor: true })
    else zone.disableInteractive()
  }
}

/**
 * Hold each click target at a constant on-screen size. `Zone.setSize` resizes
 * the rectangular input hit area too, so the clickable patch tracks the marker
 * rather than growing/shrinking with the world as you zoom.
 */
export function sizeHitZones(
  zones: readonly Phaser.GameObjects.Zone[],
  hitTargetScreenSize: number,
  zoom: number,
): void {
  const size = screenPxToWorld(hitTargetScreenSize, zoom)
  for (const zone of zones) zone.setSize(size, size)
}

export interface MarkerLabelStyle {
  readonly fontWeight: string
  /** Label font size in CSS pixels; converted to device pixels here via DPR. */
  readonly screenSize: number
  readonly color: string
  readonly align?: 'center'
}

/**
 * The marker-label idiom shared by every marker layer: rasterised at device
 * resolution (`resolution: DPR`) so text stays crisp on HiDPI displays, and
 * anchored bottom-centre so the label sits above its marker, centred on it.
 */
export function createMarkerLabel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  style: MarkerLabelStyle,
  depth: number,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, {
      fontFamily: FONT_FAMILY,
      fontStyle: style.fontWeight,
      fontSize: `${style.screenSize * DPR}px`,
      color: style.color,
      align: style.align ?? 'left',
      resolution: DPR,
    })
    .setOrigin(0.5, 1)
    .setDepth(depth)
}
