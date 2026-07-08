/**
 * Shared geographic co-location helpers. "GPS is the source of truth", so
 * proximity between two points of interest is always judged in real-world
 * kilometres here (never in pixels), and this is the one place that logic lives —
 * used by the cross-type (airfield ↔ airfield ↔ radar) label combine.
 */

/** Anything carrying WGS84 lon/lat degrees. */
export interface GeoPoint {
  readonly lon: number
  readonly lat: number
}

/**
 * Real-world radius (km) within which two sites are treated as one physical
 * location. Several Danish air bases host an airfield and a long-range radar (and
 * a co-located civil airport) within a couple of km of each other; this radius
 * captures such pairs without pulling in genuinely separate sites (e.g. the
 * Bornholm radar sits ~10 km from Bornholm's airport and stays separate). A
 * real-world distance, so it lives in the world layer (in km), not with the
 * on-screen pixel constants in `config.ts`.
 */
export const COLOCATION_RADIUS_KM = 6

/**
 * Great-circle distance between two points in kilometres (haversine). Used only
 * to decide co-location, so the exact earth radius is immaterial.
 */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const earthRadiusKm = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h))
}

/** A located, named point of interest fed into the co-location label combine. */
export interface ColocationInput extends GeoPoint {
  readonly name: string
  /**
   * Lower value wins ownership of a co-located cluster's shared label — its name is
   * the one shown (ties break to the earlier item). The caller sets the ordering;
   * `MainScene` ranks military airfield < major < minor < radar.
   */
  readonly priority: number
}

/** The label decision for one input item. */
export interface ColocationLabel {
  /** Text to display: the owner's `name +N` badge on the cluster owner, else the item's own name. */
  readonly label: string
  /** True when a co-located sibling owns the shared label (or this item is hidden), so it draws no label. */
  readonly suppressed: boolean
}

/**
 * Group point-of-interest indices by proximity: any items within `radiusKm` of
 * one another (single-linkage) form one cluster — a single physical site. Every
 * item appears in exactly one returned group (lone sites are singletons), and each
 * group is in ascending index order. Computed once; label ownership within a
 * cluster is resolved separately (see `resolveColocationLabels`) because it
 * depends on which layers are currently shown.
 */
export function clusterByProximity(
  items: readonly ColocationInput[],
  radiusKm: number,
): number[][] {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
    throw new Error(`[map/colocate] radiusKm must be finite and > 0, got ${radiusKm}`)
  }

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

  // Group indices by cluster root (each group stays in ascending index order).
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
 * Resolve the display label for every item given precomputed `clusters` and which
 * items are currently `visible` (its layer/toggle is on). Within each cluster only
 * the *visible* members count: the highest-priority (lowest `priority`) visible one
 * owns the label and shows its name with a ` +N` badge for the other visible
 * members (or just its name when it's the only one shown); everyone else is
 * suppressed. So hiding a co-located layer drops both its glyph and its share of
 * the count, and can hand ownership to a lower-priority site that's still shown.
 * Returns one result per item, in input order.
 */
export function resolveColocationLabels(
  items: readonly ColocationInput[],
  clusters: readonly (readonly number[])[],
  visible: readonly boolean[],
): ColocationLabel[] {
  if (visible.length !== items.length) {
    throw new Error(
      `[map/colocate] visible length ${visible.length} must match items length ${items.length}`,
    )
  }

  // Default: no label. Only a cluster's visible owner overrides this below.
  const results: ColocationLabel[] = items.map((it) => ({ label: it.name, suppressed: true }))
  for (const group of clusters) {
    const shown = group.filter((i) => visible[i])
    if (shown.length === 0) continue

    // Owner = lowest priority among the shown members; `shown` is ascending-index
    // (inherited from the cluster), so the first hit wins ties.
    let owner = shown[0]
    for (const i of shown) {
      if (items[i].priority < items[owner].priority) owner = i
    }

    const others = shown.length - 1
    results[owner] = {
      label: others > 0 ? `${items[owner].name} +${others}` : items[owner].name,
      suppressed: false,
    }
  }
  return results
}
