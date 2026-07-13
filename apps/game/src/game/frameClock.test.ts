import { describe, it, expect } from 'vitest'
import { FrameClock } from './frameClock'

describe('FrameClock', () => {
  it('returns 0 on the first sample', () => {
    const clock = new FrameClock()
    expect(clock.sample(1234.5)).toBe(0)
  })

  it('converts ms timestamps to second deltas', () => {
    const clock = new FrameClock()
    clock.sample(0)
    expect(clock.sample(125)).toBe(0.125)
    expect(clock.sample(141.67)).toBeCloseTo(0.01667, 10)
  })

  it('telescopes: deltas sum to exactly the total elapsed time', () => {
    const clock = new FrameClock()
    const timestamps = [1000, 1016.67, 1024.9, 1058.2, 5000, 5008.33]
    let sum = 0
    for (const t of timestamps) sum += clock.sample(t)
    expect(sum * 1000).toBeCloseTo(timestamps[timestamps.length - 1] - timestamps[0], 9)
  })

  it('clamps a sub-epsilon backwards timestamp to 0 without losing time', () => {
    const clock = new FrameClock()
    clock.sample(100)
    expect(clock.sample(99.5)).toBe(0)
    expect(clock.sample(200)).toBe(0.1)
  })

  it('throws when the timestamp goes grossly backwards', () => {
    const clock = new FrameClock()
    clock.sample(100)
    expect(() => clock.sample(50)).toThrow(/went backwards/)
  })

  it('throws on non-finite timestamps', () => {
    const clock = new FrameClock()
    expect(() => clock.sample(Number.NaN)).toThrow(/must be finite/)
    expect(() => clock.sample(Infinity)).toThrow(/must be finite/)
  })
})
