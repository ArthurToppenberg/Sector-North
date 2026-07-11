import { describe, it, expect } from 'vitest'
import {
  clusterByProximity,
  resolveColocationLabels,
  type ColocationInput,
} from './colocate'
import { KM_PER_DEG_LAT } from './project'

// Sites offset purely in latitude so the great-circle distance is (to within
// ~0.0001%) the km offset requested — keeps the radius assertions honest.
function site(name: string, kmNorth: number, priority = 0): ColocationInput {
  return { name, lon: 12, lat: 55 + kmNorth / KM_PER_DEG_LAT, priority }
}

describe('clusterByProximity', () => {
  it('merges a pair within the radius into one cluster', () => {
    const clusters = clusterByProximity([site('A', 0), site('B', 5)], 6)
    expect(clusters).toEqual([[0, 1]])
  })

  it('keeps a pair beyond the radius as two clusters', () => {
    const clusters = clusterByProximity([site('A', 0), site('B', 10)], 6)
    expect(clusters).toHaveLength(2)
    expect(clusters.flat().sort()).toEqual([0, 1])
  })

  it('chains single-linkage: A–B and B–C in range merges all three even when A–C is not', () => {
    const clusters = clusterByProximity([site('A', 0), site('B', 5), site('C', 10)], 6)
    expect(clusters).toEqual([[0, 1, 2]])
  })

  it('treats the radius as inclusive at the boundary', () => {
    expect(clusterByProximity([site('A', 0), site('B', 5.999)], 6)).toHaveLength(1)
    expect(clusterByProximity([site('A', 0), site('B', 6.001)], 6)).toHaveLength(2)
  })

  it('throws on a non-positive or non-finite radius', () => {
    expect(() => clusterByProximity([site('A', 0)], 0)).toThrow(/radiusKm must be finite/)
    expect(() => clusterByProximity([site('A', 0)], -1)).toThrow(/radiusKm must be finite/)
    expect(() => clusterByProximity([site('A', 0)], Number.NaN)).toThrow(/radiusKm must be finite/)
  })

  it('throws on invalid inputs instead of silently mis-clustering', () => {
    expect(() => clusterByProximity([{ ...site('A', 0), name: '' }], 6)).toThrow(/empty or non-string name/)
    expect(() => clusterByProximity([{ ...site('A', 0), lat: Number.NaN }], 6)).toThrow(/non-finite coordinates/)
    expect(() => clusterByProximity([{ ...site('A', 0), priority: Number.NaN }], 6)).toThrow(/non-finite priority/)
  })
})

describe('resolveColocationLabels', () => {
  const items = [site('A', 0, 2), site('B', 1, 0), site('C', 2, 1)]
  const oneCluster = [[0, 1, 2]]

  it('gives the lowest-priority visible member the label with a +N badge', () => {
    const labels = resolveColocationLabels(items, oneCluster, [true, true, true])
    expect(labels[1]).toEqual({ label: 'B +2', suppressed: false })
    expect(labels[0].suppressed).toBe(true)
    expect(labels[2].suppressed).toBe(true)
  })

  it('hands ownership to the next-lowest visible member when the owner is hidden', () => {
    const labels = resolveColocationLabels(items, oneCluster, [true, false, true])
    expect(labels[2]).toEqual({ label: 'C +1', suppressed: false })
    expect(labels[0].suppressed).toBe(true)
    expect(labels[1].suppressed).toBe(true)
  })

  it('suppresses everything in a fully hidden cluster', () => {
    const labels = resolveColocationLabels(items, oneCluster, [false, false, false])
    expect(labels.every((l) => l.suppressed)).toBe(true)
  })

  it('labels a visible singleton with its bare name', () => {
    const labels = resolveColocationLabels([site('A', 0)], [[0]], [true])
    expect(labels[0]).toEqual({ label: 'A', suppressed: false })
  })

  it('breaks priority ties by first index', () => {
    const tied = [site('A', 0, 1), site('B', 1, 1)]
    const labels = resolveColocationLabels(tied, [[0, 1]], [true, true])
    expect(labels[0]).toEqual({ label: 'A +1', suppressed: false })
    expect(labels[1].suppressed).toBe(true)
  })

  it('throws on a visible/items length mismatch', () => {
    expect(() => resolveColocationLabels(items, oneCluster, [true, true])).toThrow(
      /visible length 2 must match items length 3/,
    )
  })

  it('throws unless clusters exactly partition the items', () => {
    expect(() => resolveColocationLabels(items, [[0, 1]], [true, true, true])).toThrow(
      /not present in any cluster/,
    )
    expect(() => resolveColocationLabels(items, [[0, 1, 2], [1]], [true, true, true])).toThrow(
      /more than one cluster/,
    )
    expect(() => resolveColocationLabels(items, [[0, 1, 2, 3]], [true, true, true])).toThrow(
      /out of range/,
    )
  })
})
