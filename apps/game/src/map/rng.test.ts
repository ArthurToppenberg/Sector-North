import { describe, it, expect } from 'vitest'
import { Rng } from './rng'

describe('Rng', () => {
  it('rejects a non-integer seed', () => {
    expect(() => new Rng(0.5)).toThrow(/seed must be an integer/)
    expect(() => new Rng(Number.NaN)).toThrow(/seed must be an integer/)
  })

  it('replays the identical sequence from the same seed', () => {
    const a = new Rng(1234)
    const b = new Rng(1234)
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next())
  })

  it('yields different sequences from different seeds', () => {
    const a = new Rng(1)
    const b = new Rng(2)
    const drawsA = Array.from({ length: 20 }, () => a.next())
    const drawsB = Array.from({ length: 20 }, () => b.next())
    expect(drawsA).not.toEqual(drawsB)
  })

  describe('next', () => {
    it('stays in [0, 1) over many draws', () => {
      const rng = new Rng(42)
      for (let i = 0; i < 10_000; i++) {
        const x = rng.next()
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThan(1)
      }
    })
  })

  describe('range', () => {
    it('stays inside [min, max) over many draws', () => {
      const rng = new Rng(7)
      for (let i = 0; i < 10_000; i++) {
        const x = rng.range(-3.5, 12.25)
        expect(x).toBeGreaterThanOrEqual(-3.5)
        expect(x).toBeLessThan(12.25)
      }
    })

    it('throws on min > max and non-finite bounds', () => {
      const rng = new Rng(7)
      expect(() => rng.range(2, 1)).toThrow(/finite min <= max/)
      expect(() => rng.range(Number.NaN, 1)).toThrow(/finite min <= max/)
      expect(() => rng.range(0, Number.POSITIVE_INFINITY)).toThrow(/finite min <= max/)
    })
  })

  describe('int', () => {
    it('reaches both inclusive bounds and never leaves them', () => {
      const rng = new Rng(99)
      const seen = new Set<number>()
      for (let i = 0; i < 10_000; i++) {
        const x = rng.int(3, 7)
        expect(Number.isInteger(x)).toBe(true)
        expect(x).toBeGreaterThanOrEqual(3)
        expect(x).toBeLessThanOrEqual(7)
        seen.add(x)
      }
      expect(seen).toEqual(new Set([3, 4, 5, 6, 7]))
    })

    it('throws on non-integer bounds and min > max', () => {
      const rng = new Rng(99)
      expect(() => rng.int(0.5, 3)).toThrow(/integers min <= max/)
      expect(() => rng.int(0, 3.5)).toThrow(/integers min <= max/)
      expect(() => rng.int(5, 4)).toThrow(/integers min <= max/)
    })
  })

  describe('exponential', () => {
    it('draws strictly positive values whose sample mean approximates the requested mean', () => {
      const rng = new Rng(2026)
      const mean = 600
      const n = 10_000
      let sum = 0
      for (let i = 0; i < n; i++) {
        const x = rng.exponential(mean)
        expect(x).toBeGreaterThan(0)
        expect(Number.isFinite(x)).toBe(true)
        sum += x
      }
      const sampleMean = sum / n
      expect(sampleMean).toBeGreaterThan(mean * 0.85)
      expect(sampleMean).toBeLessThan(mean * 1.15)
    })

    it('throws on a zero, negative, or non-finite mean', () => {
      const rng = new Rng(2026)
      expect(() => rng.exponential(0)).toThrow(/non-positive/)
      expect(() => rng.exponential(-1)).toThrow(/non-positive/)
      expect(() => rng.exponential(Number.NaN)).toThrow(/non-positive/)
    })
  })
})
