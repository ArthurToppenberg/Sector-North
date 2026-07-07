// Central tuning + shared constants. Logic lives in the layers; the numbers you
// might want to nudge live here. Every "screen" value is in CSS pixels and is
// converted to world (device-pixel) units via `screenPxToWorld` in units.ts.

/**
 * Device pixel ratio, floored at 1. The canvas backing store is sized at
 * `cssPixels * DPR` and scaled back down via Phaser's `zoom` config, so all
 * in-game coordinates are in device pixels.
 *
 * The `|| 1` is NOT a fallback masking a missing value (which the project rules
 * forbid): `window.devicePixelRatio` is `0`/`undefined` only in environments
 * with no display density concept, where a ratio of exactly 1 is the correct
 * answer, not a guess. The outer `Math.max(..., 1)` additionally rejects a
 * pathological sub-1 ratio.
 */
export const DPR = Math.max(window.devicePixelRatio || 1, 1)

/** Shared HUD typeface — Chakra Petch, a squared techno face for the tactical look. */
export const FONT_FAMILY = 'Chakra Petch'

/**
 * Game-level event the scene emits once `create` has finished — i.e. the world
 * is projected and every asset (currently the toolbar's SVG glyph) has loaded.
 * `main.ts` listens for it to tear down the boot loader. Shared here so the
 * emit and the listen can't drift apart.
 */
export const APP_READY_EVENT = 'app-ready'

export const MAP = {
  /** Clear margin (CSS pixels) kept around the country when first fitting it. */
  padding: 48,
  /** Coastline thickness on screen (CSS pixels), held constant across zoom. */
  strokeScreenWidth: 0.75,
  /**
   * Coastline colour — radar phosphor green, the green of tactical C2 / radar
   * displays. The map geography is deliberately NOT bound by the white/black HUD
   * rule (that governs overlay chrome); see `apps/game/CLAUDE.md`.
   */
  strokeColor: 0x33ff66,
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
   * `fadeEndZoom` — a short band just above 1.5 so the grid appears promptly
   * once you start zooming in rather than only at high zoom.
   */
  fadeStartZoom: 1.5,
  fadeEndZoom: 2.25,
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
  // Interactive chrome sits above the read-only telemetry HUD; the icon draws
  // one step above its own button surface.
  toolbarButton: 110,
  toolbarIcon: 111,
} as const

/**
 * Camera zoom limits and wheel response.
 * `step` is the zoom factor applied by one full wheel notch; `deltaPerStep` is the
 * `deltaY` magnitude that counts as one notch. Scaling the factor by the actual delta
 * (rather than a fixed step per event) keeps a trackpad — which fires a rapid stream of
 * small-delta events — from compounding into runaway zoom.
 */
export const ZOOM = { min: 6.5, max: 40, step: 1.12, deltaPerStep: 100 } as const

export const HUD = {
  /** Debug readout font size on screen (CSS pixels). */
  fontScreenSize: 13,
  /** Debug readout inset from the top-right corner (CSS pixels). */
  marginScreen: 10,
} as const

/**
 * Top-left toolbar of icon buttons (currently just the city-name toggle).
 * All sizes are CSS pixels, converted to device pixels via DPR when drawn.
 * HUD rule: white or black only — so on/off state is shown through *alpha*
 * (a dimmed vs full-strength glyph), never a colour change.
 */
export const TOOLBAR = {
  /** Square button edge length on screen (CSS pixels). */
  buttonScreenSize: 34,
  /** Icon glyph edge length within the button on screen (CSS pixels). */
  iconScreenSize: 18,
  /** Inset of the toolbar from the top-left corner (CSS pixels). */
  marginScreen: 10,
  /** Gap between adjacent buttons, for when the toolbar grows (CSS pixels). */
  gapScreen: 6,
  /** Button surface fill (black) and its resting / hover opacity. */
  buttonColor: 0x000000,
  buttonAlpha: 0.35,
  buttonHoverAlpha: 0.6,
  /** Button border (white), its width (CSS pixels) and opacity. */
  borderColor: 0xffffff,
  borderScreenWidth: 1,
  borderAlpha: 0.7,
  /** Icon glyph opacity when the toggle is on (active) vs off (inactive). */
  iconActiveAlpha: 1,
  iconInactiveAlpha: 0.3,
} as const

/**
 * Keyboard pan speed as CSS pixels/second on screen (held constant across zoom
 * by dividing the world step by the current zoom).
 */
export const KEY_PAN_SPEED = 700

/**
 * The play area: fixed limits for where the camera CENTRE (the world point it
 * looks at) may roam, expressed as a **geographic** lon/lat box around Denmark.
 * The game is focused on Danish airspace, so this confines the player to that
 * region regardless of zoom.
 *
 * Kept in lon/lat — not pixels — on purpose: pixel bounds would break the moment
 * the projection changes (adding a country rescales/shifts the whole map) or the
 * window is resized. `MainScene` runs these four corners through the projection's
 * `project()` at load to derive the world-pixel clamp box, so the play area
 * always tracks the same real-world patch of Earth. This is the "GPS is the
 * source of truth" rule applied to the camera. Degrees are WGS84.
 *
 * DO NOT change these values (or the ZOOM min/max above) without an explicit
 * request from the user — see the "Camera bounds are locked" rule in
 * `apps/game/CLAUDE.md`.
 */
export const CAMERA_CENTER_BOUNDS = {
  /** Longitude (°E) extents — into the North Sea (west) out past Bornholm (east). */
  west: 6,
  east: 15.5,
  /** Latitude (°N) extents — south of the German border to north of Skagen. */
  south: 54,
  north: 58,
} as const
