import Phaser from 'phaser'
import { DPR } from './config'

/**
 * Convert a length given in on-screen CSS pixels into world (device-pixel) units
 * at the given camera zoom. Single source of truth for the "constant on-screen
 * size regardless of zoom" trick shared by the coastline hairline, the city
 * markers, and the keyboard pan speed.
 */
export function screenPxToWorld(screenPx: number, zoom: number): number {
  return (screenPx * DPR) / zoom
}

/**
 * Smooth Hermite interpolation: 0 for `x <= edge0`, 1 for `x >= edge1`, with an
 * eased S-curve in between (zero slope at both ends, so a fade driven by this
 * reads as gradual rather than a linear ramp). Used to fade the grid in over a
 * zoom band. Requires `edge0 < edge1` — an empty or inverted band is a config
 * bug, so throw rather than divide by zero.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (!(edge1 > edge0)) {
    throw new Error(`[smoothstep] edge0 (${edge0}) must be < edge1 (${edge1})`)
  }
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}

/** The world-space (device-px) rectangle a camera is actually displaying. */
export interface WorldView {
  left: number
  top: number
  right: number
  bottom: number
  /** Centre of the view — the point the camera looks at. */
  centerX: number
  centerY: number
  /** Visible extent in world px (`cam.width / zoom`, `cam.height / zoom`). */
  width: number
  height: number
}

/**
 * The single source of truth for "what world rectangle is on screen right now".
 *
 * Phaser anchors zoom at the camera MIDPOINT, not the top-left: `scrollX/Y` is
 * the visible top-left corner only at zoom 1. The invariant that always holds is
 * `centre = scroll + size/2` (zoom-independent), with the visible extent being
 * `size / zoom` around that centre. Every layer that needs the visible slice
 * (the grid) or the look-at point (the clamp, the HUD) derives it here rather
 * than re-guessing the relationship between scroll and zoom — getting that wrong
 * once is what made the grid clip and the pan clamp fight the camera.
 *
 * Derived from live `scroll/zoom/size` (not `cam.worldView`, which Phaser only
 * refreshes in `preRender` and so lags a frame behind the current update tick).
 */
export function cameraWorldView(cam: Phaser.Cameras.Scene2D.Camera): WorldView {
  const width = cam.width / cam.zoom
  const height = cam.height / cam.zoom
  const centerX = cam.scrollX + cam.width / 2
  const centerY = cam.scrollY + cam.height / 2
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2,
    centerX,
    centerY,
    width,
    height,
  }
}
