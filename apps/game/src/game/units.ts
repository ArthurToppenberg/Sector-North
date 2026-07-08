import { DPR } from './config'

function assertFiniteLength(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`screenPxToWorld: ${label} must be finite, got ${value}`)
  }
}

function assertPositiveZoom(zoom: number): void {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    throw new Error(`screenPxToWorld: zoom must be a finite positive number, got ${zoom}`)
  }
}

// Convert an on-screen CSS-pixel length to world (device-pixel) units at the given zoom.
export function screenPxToWorld(screenPx: number, zoom: number): number {
  assertFiniteLength(screenPx, 'screenPx')
  assertPositiveZoom(zoom)
  return (screenPx * DPR) / zoom
}
