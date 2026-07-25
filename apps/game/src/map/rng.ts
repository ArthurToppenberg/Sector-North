import { isFiniteNumber, makeFail, requirePositiveNumber } from './validate'

const fail = makeFail('map/rng')

/**
 * Deterministic world-model randomness (mulberry32). The determinism core rule
 * (root CLAUDE.md) bans Math.random() in src/map/ — every draw must replay
 * bit-identically from the seed, so the same seed always yields the same sky.
 */
export class Rng {
  private state: number

  constructor(seed: number) {
    if (!Number.isInteger(seed)) fail(`seed must be an integer, got ${JSON.stringify(seed)}`)
    this.state = seed >>> 0
  }

  /** Uniform draw in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Uniform draw in [min, max). */
  range(min: number, max: number): number {
    if (!isFiniteNumber(min) || !isFiniteNumber(max) || max < min) {
      fail(`range wants finite min <= max, got [${min}, ${max})`)
    }
    return min + (max - min) * this.next()
  }

  /** Uniform integer draw in [min, max], both inclusive. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      fail(`int wants integers min <= max, got [${min}, ${max}]`)
    }
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /**
   * Exponential draw with the given mean — the inter-arrival time of a Poisson
   * process, which is how independent real-world flights arrive.
   * `1 - next()` keeps the log argument in (0, 1]: next() can return exactly
   * 0, whose log is -Infinity.
   */
  exponential(mean: number): number {
    requirePositiveNumber(mean, fail, 'exponential mean')
    return -Math.log(1 - this.next()) * mean
  }
}
