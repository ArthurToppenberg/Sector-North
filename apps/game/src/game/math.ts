// Generic, domain-agnostic math helpers.

/**
 * Smooth Hermite interpolation: 0 for `x <= edge0`, 1 for `x >= edge1`, with an
 * eased S-curve in between (zero slope at both ends, so a fade driven by this
 * reads as gradual rather than a linear ramp). Used to fade the grid in over a
 * zoom band. Requires finite inputs and `edge0 < edge1` — a non-finite value or
 * an empty/inverted band is a bug (broken camera or misconfigured band), so
 * throw rather than silently return NaN or divide by zero. Called once per grid
 * redraw, so the three finite checks are negligible next to the draw loop.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (!Number.isFinite(edge0) || !Number.isFinite(edge1)) {
    throw new Error(`[smoothstep] edges must be finite (got edge0=${edge0}, edge1=${edge1})`)
  }
  if (edge1 <= edge0) {
    throw new Error(`[smoothstep] edge0 (${edge0}) must be < edge1 (${edge1})`)
  }
  if (!Number.isFinite(x)) {
    throw new Error(`[smoothstep] x must be finite (got ${x})`)
  }
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}
