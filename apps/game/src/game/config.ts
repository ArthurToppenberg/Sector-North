// Central tuning + shared constants. Logic lives in the layers; the numbers you
// might want to nudge live here. Every "screen" value is in CSS pixels and is
// converted to world (device-pixel) units via `screenPxToWorld` in units.ts.

/**
 * Device pixel ratio, floored at 1. The canvas backing store is sized at
 * `cssPixels * DPR` and scaled back down via Phaser's `zoom` config, so all
 * in-game coordinates are in device pixels.
 */
export const DPR = Math.max(window.devicePixelRatio || 1, 1)

/** Shared HUD typeface — Chakra Petch, a squared techno face for the tactical look. */
export const FONT_FAMILY = 'Chakra Petch'

export const MAP = {
  /** Clear margin (CSS pixels) kept around the country when first fitting it. */
  padding: 48,
  /** Coastline thickness on screen (CSS pixels), held constant across zoom. */
  strokeScreenWidth: 0.75,
  /** Coastline colour. */
  strokeColor: 0xffffff,
} as const

export const CITY = {
  /** Marker dot radius on screen (CSS pixels). */
  dotScreenRadius: 3.5,
  /** Dot fill colour. */
  dotColor: 0xffffff,
  /** Label text colour. */
  labelColor: '#ffffff',
  /** Label font size on screen (CSS pixels). */
  labelScreenSize: 13,
  /** Clear gap between the top of the dot and the bottom of the label (CSS pixels). */
  labelScreenGap: 4,
} as const

// Faint real-world reference grid drawn beneath the map. Because the game is
// built on true lon/lat, each cell is a fixed size on the ground — a constant
// scale bar the player can read even out over open water where no land is in
// view. Only the visible slice is drawn, re-snapped to the grid each frame.
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
   * `fadeEndZoom` — the band straddles zoom ~2.5 so the fade reads as gradual.
   */
  fadeStartZoom: 1.5,
  fadeEndZoom: 3.5,
} as const

/**
 * Explicit draw order for every world/HUD object (higher renders on top).
 * Centralised so layering is declared in ONE place instead of scattered magic
 * `setDepth` numbers on each object. The grid is the backdrop that every other
 * layer draws over; the HUD sits above all world layers. Add new layers here so
 * their stacking is obvious at a glance.
 */
export const DEPTH = {
  grid: 0,
  coastline: 10,
  cityDots: 20,
  cityLabels: 30,
  hud: 100,
} as const

/** Camera zoom limits and per-notch wheel factor. */
export const ZOOM = { min: 0.4, max: 12, step: 1.12 } as const

export const HUD = {
  /** Debug readout font size on screen (CSS pixels). */
  fontScreenSize: 13,
  /** Debug readout inset from the top-right corner (CSS pixels). */
  marginScreen: 10,
} as const

/**
 * Keyboard pan speed as CSS pixels/second on screen (held constant across zoom
 * by dividing the world step by the current zoom).
 */
export const KEY_PAN_SPEED = 700

/**
 * How far past the map's bounding box (CSS pixels) the camera may travel, so the
 * player can nudge the coast off-centre but never lose it entirely. The real
 * scroll bounds are derived from the projected map plus this margin — no
 * hard-coded scroll box.
 */
export const CAMERA_MARGIN_SCREEN = 120
