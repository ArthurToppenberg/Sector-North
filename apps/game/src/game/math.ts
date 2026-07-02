/**
 * Generic, domain-agnostic math helpers. Nothing here knows about Phaser, the
 * projection, or the game — pure functions with no dependencies, kept separate
 * from the projection scaling (units.ts) and camera geometry (camera.ts) so each
 * has a single reason to change.
 */

/**
 * Smooth Hermite interpolation: 0 for `x <= edge0`, 1 for `x >= edge1`, with an
 * eased S-curve in between (zero slope at both ends, so a fade driven by this
 * reads as gradual rather than a linear ramp). Used to fade the grid in over a
 * zoom band. Requires `edge0 < edge1` — an empty or inverted band is a config
 * bug, so throw rather than divide by zero.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (!(edge1 > edge0)) {
    throw new Error(`[smoothstep] edge0 (${edge0}) must be < edge1 (${edge1})`)
  }
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}
