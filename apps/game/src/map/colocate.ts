// Shared geographic co-location helpers. See apps/game/CLAUDE.md.

/** Anything carrying WGS84 lon/lat degrees. */
export interface GeoPoint {
  readonly lon: number
  readonly lat: number
}

// Real-world km distance; see apps/game/CLAUDE.md for calibration.
export const COLOCATION_RADIUS_KM = 6

/** A located, named point of interest fed into the co-location label combine. */
export interface ColocationInput extends GeoPoint {
  readonly name: string
  readonly priority: number
}

export interface ColocationLabel {
  readonly label: string
  readonly suppressed: boolean
}

/**
 * Great-circle distance between two points in kilometres (haversine). Used only
 * to decide co-location, so the exact earth radius is immaterial.
 */
function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const earthRadiusKm = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h))
}

/**
 * Precondition check for every co-location input: names must be non-empty and
 * every number the algorithm depends on (coordinates, priority) must be finite.
 * A non-finite coordinate would make `distanceKm` return `NaN` and silently drop
 * the site into its own singleton cluster; a non-finite priority would silently
 * lose the owner comparison. Both are masked failures, so we throw instead.
 */
function assertValidInputs(items: readonly ColocationInput[]): void {
  items.forEach((item, i) => {
    if (typeof item.name !== 'string' || item.name.length === 0) {
      throw new Error(`[map/colocate] item ${i} has an empty or non-string name`)
    }
    if (!Number.isFinite(item.lon) || !Number.isFinite(item.lat)) {
      throw new Error(
        `[map/colocate] item ${i} (${item.name}) has non-finite coordinates: lon=${item.lon}, lat=${item.lat}`,
      )
    }
    if (!Number.isFinite(item.priority)) {
      throw new Error(`[map/colocate] item ${i} (${item.name}) has non-finite priority: ${item.priority}`)
    }
  })
}

/**
 * Precondition check that `clusters` is an exact partition of `[0, itemCount)`:
 * every item index appears in exactly one cluster, and no index is out of range or
 * duplicated. `resolveColocationLabels` relies on this to guarantee every item is
 * covered — without it, an item missing from all clusters would silently keep its
 * suppressed default, masking a malformed clustering.
 */
function assertClusterPartition(
  clusters: readonly (readonly number[])[],
  itemCount: number,
): void {
  const seen = new Array<boolean>(itemCount).fill(false)
  for (const cluster of clusters) {
    for (const index of cluster) {
      if (!Number.isInteger(index) || index < 0 || index >= itemCount) {
        throw new Error(`[map/colocate] cluster index ${index} out of range [0, ${itemCount})`)
      }
      if (seen[index]) {
        throw new Error(`[map/colocate] item index ${index} appears in more than one cluster`)
      }
      seen[index] = true
    }
  }
  const missing = seen.indexOf(false)
  if (missing !== -1) {
    throw new Error(`[map/colocate] item index ${missing} is not present in any cluster`)
  }
}

export function clusterByProximity(
  items: readonly ColocationInput[],
  radiusKm: number,
): number[][] {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
    throw new Error(`[map/colocate] radiusKm must be finite and > 0, got ${radiusKm}`)
  }
  assertValidInputs(items)

  // Union-find over item indices: union any pair within radiusKm. The POI count is
  // tiny, so the O(n²) pair scan is fine.
  const parent = items.map((_, i) => i)
  const find = (i: number): number => {
    let root = i
    while (parent[root] !== root) root = parent[root]
    while (parent[i] !== root) {
      const next = parent[i]
      parent[i] = root
      i = next
    }
    return root
  }
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b)
  }
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (distanceKm(items[i], items[j]) <= radiusKm) union(i, j)
    }
  }

  const groups = new Map<number, number[]>()
  for (let i = 0; i < items.length; i++) {
    const root = find(i)
    const group = groups.get(root)
    if (group) group.push(i)
    else groups.set(root, [i])
  }
  return [...groups.values()]
}

/**
 * The cluster owner: the lowest-`priority` index among the currently shown members.
 * `shown` is in ascending index order (inherited from the cluster), so the first
 * hit wins ties.
 */
function selectClusterOwner(shown: readonly number[], items: readonly ColocationInput[]): number {
  if (shown.length === 0) {
    throw new Error('[map/colocate] selectClusterOwner requires at least one shown member')
  }
  let owner = shown[0]
  for (const index of shown) {
    if (items[index].priority < items[owner].priority) owner = index
  }
  return owner
}

export function resolveColocationLabels(
  items: readonly ColocationInput[],
  clusters: readonly (readonly number[])[],
  visible: readonly boolean[],
): ColocationLabel[] {
  assertValidInputs(items)
  if (visible.length !== items.length) {
    throw new Error(
      `[map/colocate] visible length ${visible.length} must match items length ${items.length}`,
    )
  }
  assertClusterPartition(clusters, items.length)

  // Suppressed default for every item; a cluster's visible owner overrides it below.
  const results: ColocationLabel[] = items.map((item) => ({ label: item.name, suppressed: true }))
  for (const cluster of clusters) {
    const shown = cluster.filter((index) => visible[index])
    if (shown.length === 0) continue

    const owner = selectClusterOwner(shown, items)
    const badgeCount = shown.length - 1
    results[owner] = {
      label: badgeCount > 0 ? `${items[owner].name} +${badgeCount}` : items[owner].name,
      suppressed: false,
    }
  }
  return results
}
