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
