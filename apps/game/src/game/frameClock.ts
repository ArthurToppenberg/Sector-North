import { makeFail, type Fail } from './fail'

const fail: Fail = makeFail('game/frameClock')

/**
 * Chrome's rAF can hand out a timestamp marginally earlier than the previous
 * one (sub-millisecond scheduler jitter — the same quirk Phaser's TimeStep
 * guards with `Math.max(0, ...)`). Anything beyond this is a real clock bug.
 */
const BACKWARDS_EPSILON_MS = 1

export class FrameClock {
  private lastMs: number | null = null

  /**
   * Feed the current raw timestamp; returns seconds since the previous sample
   * (0 on the first — no delta can be known before two samples exist).
   */
  sample(nowMs: number): number {
    if (!Number.isFinite(nowMs)) fail(`timestamp must be finite, got ${nowMs}`)
    if (this.lastMs === null) {
      this.lastMs = nowMs
      return 0
    }
    if (nowMs < this.lastMs - BACKWARDS_EPSILON_MS) {
      fail(`timestamp went backwards: ${nowMs} after ${this.lastMs}`)
    }
    // Jittered-backwards timestamp within epsilon: report no elapsed time, and
    // leave the anchor where it is rather than adopting it — adopting it would
    // double-count the lost sliver on the next sample and break the exact
    // telescoping sum.
    if (nowMs <= this.lastMs) return 0
    const deltaSec = (nowMs - this.lastMs) / 1000
    this.lastMs = nowMs
    return deltaSec
  }
}
