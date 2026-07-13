import { describe, it, expect } from 'vitest'

;(globalThis as { window?: { devicePixelRatio: number; location: { hostname: string } } }).window = {
  devicePixelRatio: 2,
  location: { hostname: 'localhost' },
}
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
