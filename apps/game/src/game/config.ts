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
export const FONT_FAMILY = 'Chakra Petch' as const

/**
 * Game-level event the scene emits once `create` has finished — i.e. the world
 * is projected and every asset (currently the toolbar's SVG glyph) has loaded.
 * `main.ts` listens for it to tear down the boot loader. Shared here so the
 * emit and the listen can't drift apart.
 */
export const APP_READY_EVENT = 'app-ready' as const

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
  /**
   * City marker icon (the Lucide `building-2` glyph, the same icon the toolbar
   * uses for the cities toggle) — its edge length on screen in CSS pixels, held
   * constant across zoom.
   */
  iconScreenSize: 15,
  /** Label text colour. */
  labelColor: '#ffffff',
  /** Label font weight (CSS numeric weight). */
  labelFontWeight: '600',
  /** Label font size on screen (CSS pixels). */
  labelScreenSize: 13,
  /** Clear gap between the top of the icon and the bottom of the label (CSS pixels). */
  labelScreenGap: 4,
  /**
   * Zoom at/above which the city name labels appear. Below it only the icons
   * show, so the far-out country view isn't crowded with names. Sits inside the
   * reachable range (`ZOOM.min`..`ZOOM.max` = 6.5..40).
   */
  labelRevealZoom: 10,
} as const

/**
 * Airfield markers. Drawn as a triangle glyph so they read as distinct from the
 * filled city circles at a glance, while staying inside the HUD white/black rule
 * — the tiers differ by *fill/size/shape*, never colour:
 *  - major airports + military airbases: LARGE triangle (military filled, the
 *    civil major hollow) — the prominent fields you notice first.
 *  - minor civil fields (grass strips, glider/flying clubs): SMALL hollow
 *    triangle, so the busy little fields don't shout as loud as the big ones.
 *
 * So airport *size* reads at a glance from the glyph size, and military vs civil
 * from the fill. Like the city layer, sizes are on-screen (CSS px) and held
 * constant across zoom. Every triangle is always drawn (all fields, all zooms).
 * The *labels*, though, would swamp the far-out country view, so they reveal
 * progressively as the player zooms in: the prominent fields (major airports +
 * military airbases) name themselves first, and the dense minor
 * grass-strip/glider names appear only once zoomed in close.
 */
export const AIRPORT = {
  /**
   * Triangle circumradius on screen (CSS pixels), per tier — the large fields
   * (major airports, military airbases) get a bigger glyph than the minor
   * grass strips/glider fields so relative importance reads from size alone.
   */
  markerScreenRadius: { military: 5, major: 5, minor: 3 },
  /** Marker outline width on screen (CSS pixels). */
  strokeScreenWidth: 1.25,
  /** Marker colour — outline for civil fields, fill for military (HUD: white). */
  color: 0xffffff,
  /** Label text colour. */
  labelColor: '#ffffff',
  /** Label font size on screen (CSS pixels). */
  labelScreenSize: 11,
  /** Clear gap between the marker and the bottom of the label (CSS pixels). */
  labelScreenGap: 3,
  /**
   * Zoom at/above which the prominent airfields (major airports + military
   * airbases) show their name labels. Sits well above `ZOOM.min` (6.5) so the
   * map opens — and stays, through the mid-range — with triangles but no names;
   * the names appear only once the player has zoomed in close on a region.
   */
  labelRevealZoom: 14,
  /**
   * Zoom at/above which the minor airfields (grass strips, glider/flying clubs)
   * show their names. Their triangles are always drawn (like every field); only
   * the dense minor *names* stay hidden until the player is zoomed right in.
   * Higher than `labelRevealZoom` and near the top of the reachable range
   * (`ZOOM.min`..`ZOOM.max` = 6.5..40), so the minor names only label up once
   * the player is zoomed in close.
   */
  minorLabelRevealZoom: 32,
  /**
   * De-clutter radius for name labels, on screen (CSS pixels). When two
   * airfields fall within this on-screen distance only ONE name is shown — the
   * highest-priority field in the cluster: a military airbase wins, else the
   * major airport, else a minor field. This collapses co-located pairs (e.g. the
   * civil + military fields that share Aalborg/Karup/Skrydstrup) to a single
   * name. Because it's an on-screen distance, zooming in separates the fields and
   * their individual names reappear. Triangles are never suppressed — only names.
   */
  labelClusterScreenRadius: 34,
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
   * `fadeEndZoom`.
   *
   * The band MUST sit inside the reachable zoom range (`ZOOM.min`..`ZOOM.max` =
   * 6.5..40) or the fade is inert: a band below `ZOOM.min` leaves `smoothstep`
   * pinned at 1 (grid always fully on), a band above `ZOOM.max` pins it at 0
   * (grid never shows). Here it starts a little above the initial framing zoom
   * (6.5) so the map opens grid-free, then the grid appears as the player zooms
   * closer in. Tunable within that range to taste.
   */
  fadeStartZoom: 8,
  fadeEndZoom: 16,
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
  // Airports sit just above the city labels so their markers/labels aren't
  // hidden under a nearby city's name.
  airportMarkers: 40,
  airportLabels: 50,
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
