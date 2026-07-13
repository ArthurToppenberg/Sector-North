export const MAP = {
  /** Clear margin (CSS pixels) kept around the country when first fitting it. */
  padding: 48,
  /** Coastline thickness on screen (CSS pixels), held constant across zoom. */
  strokeScreenWidth: 0.75,
  // Coastline colour — radar phosphor green.
  strokeColor: 0x33ff66,
} as const

// Faint real-world reference grid drawn beneath the map.
export const GRID = {
  /** Cell size on the ground, in kilometres (square). */
  cellKm: 50,
  /** Line thickness on screen (CSS pixels), held constant across zoom. */
  strokeScreenWidth: 1,
  /** Line colour (HUD rule: white or black only). */
  color: 0xffffff,
  /**
   * Peak line opacity once fully faded in — faint, so the grid reads as
   * background, not foreground.
   */
  maxAlpha: 0.1,
  /**
   * The grid fades in with zoom instead of being always-on: it clutters the
   * far-out country view but earns its place as a scale reference once you zoom
   * in. Invisible at/below `fadeStartZoom`, ramped smoothly to `maxAlpha` by
   * `fadeEndZoom`.
   *
   * The band MUST sit inside the reachable zoom range (`ZOOM.min`..`ZOOM.max` =
   * 6.5..60) or the fade is inert: a band below `ZOOM.min` leaves `smoothstep`
   * pinned at 1 (grid always fully on), a band above `ZOOM.max` pins it at 0
   * (grid never shows). Here it starts a little above the initial framing zoom
   * (6.5) so the map opens grid-free, then the grid appears as the player zooms
   * closer in. Tunable within that range to taste.
   */
  fadeStartZoom: 8,
  fadeEndZoom: 16,
} as const
