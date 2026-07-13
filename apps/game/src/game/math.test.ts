import { describe, it, expect } from 'vitest'
import { smoothstep } from './math'

describe('smoothstep', () => {
  it('clamps to 0 below the band and 1 above it', () => {
    expect(smoothstep(0, 1, -5)).toBe(0)
    expect(smoothstep(0, 1, 0)).toBe(0)
    expect(smoothstep(0, 1, 1)).toBe(1)
    expect(smoothstep(0, 1, 5)).toBe(1)
  })

  it('passes through 0.5 at the midpoint and eases monotonically', () => {
    expect(smoothstep(0, 1, 0.5)).toBe(0.5)
    expect(smoothstep(2, 6, 4)).toBe(0.5)
    const quarter = smoothstep(0, 1, 0.25)
    const threeQuarters = smoothstep(0, 1, 0.75)
    expect(quarter).toBeGreaterThan(0)
    expect(quarter).toBeLessThan(0.5)
    expect(threeQuarters).toBeGreaterThan(0.5)
    expect(threeQuarters).toBeLessThan(1)
  })

  it('throws on an empty or inverted band', () => {
    expect(() => smoothstep(1, 1, 0.5)).toThrow(/must be </)
    expect(() => smoothstep(2, 1, 0.5)).toThrow(/must be </)
  })

  it('throws on non-finite inputs', () => {
    expect(() => smoothstep(Number.NaN, 1, 0.5)).toThrow(/edges must be finite/)
    expect(() => smoothstep(0, Infinity, 0.5)).toThrow(/edges must be finite/)
    expect(() => smoothstep(0, 1, Number.NaN)).toThrow(/x must be finite/)
  })
})
