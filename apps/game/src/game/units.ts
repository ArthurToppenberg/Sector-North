import { DPR } from './config'

/**
 * Convert a length given in on-screen CSS pixels into world (device-pixel) units
 * at the given camera zoom. Single source of truth for the "constant on-screen
 * size regardless of zoom" trick shared by the coastline hairline, the city
 * markers, and the keyboard pan speed.
 *
 * Fails fast: a non-finite `screenPx`, or a non-finite / non-positive `zoom`,
 * is a bug in the caller (bad config value or an uninitialised camera) and
 * throws immediately rather than silently producing NaN / Infinity that would
 * corrupt every derived stroke width, marker radius and pan step downstream.
 */
export function screenPxToWorld(screenPx: number, zoom: number): number {
  if (!Number.isFinite(screenPx)) {
    throw new Error(`screenPxToWorld: screenPx must be finite, got ${screenPx}`)
  }
  if (!Number.isFinite(zoom) || zoom <= 0) {
    throw new Error(`screenPxToWorld: zoom must be a finite positive number, got ${zoom}`)
  }
  return (screenPx * DPR) / zoom
}
