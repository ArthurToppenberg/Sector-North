import { describe, it, expect } from 'vitest'

// `./units` pulls DPR from `./config`, which reads `window.devicePixelRatio` at
// module load. Stub the global with a known DPR before the dynamic import — a
// static import would hoist above the stub and crash the node environment.
;(globalThis as { window?: { devicePixelRatio: number } }).window = { devicePixelRatio: 2 }
const { screenPxToWorld } = await import('./units')

describe('screenPxToWorld', () => {
  it('scales screen pixels by DPR and divides out the zoom', () => {
    expect(screenPxToWorld(10, 2)).toBe(10)
    expect(screenPxToWorld(10, 4)).toBe(5)
    expect(screenPxToWorld(0, 3)).toBe(0)
  })

  it('throws on a non-positive or non-finite zoom', () => {
    expect(() => screenPxToWorld(10, 0)).toThrow(/zoom must be a finite positive number/)
    expect(() => screenPxToWorld(10, -1)).toThrow(/zoom must be a finite positive number/)
    expect(() => screenPxToWorld(10, Number.NaN)).toThrow(/zoom must be a finite positive number/)
  })

  it('throws on a non-finite screen length', () => {
    expect(() => screenPxToWorld(Number.NaN, 2)).toThrow(/screenPx must be finite/)
    expect(() => screenPxToWorld(Infinity, 2)).toThrow(/screenPx must be finite/)
  })
})
