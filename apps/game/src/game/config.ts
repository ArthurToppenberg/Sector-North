// Central tuning + shared constants.

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
 * is projected and every preloaded asset (the toolbar + city SVG glyphs, the radar
 * site photos, and the boundary/cities/airports/radars JSON) has loaded. `main.ts`
 * listens for it to tear down the boot loader. Shared here so the emit and the
 * listen can't drift apart.
 */
export const APP_READY_EVENT = 'app-ready' as const

export const MAP = {
  /** Clear margin (CSS pixels) kept around the country when first fitting it. */
  padding: 48,
  /** Coastline thickness on screen (CSS pixels), held constant across zoom. */
  strokeScreenWidth: 0.75,
  // Coastline colour — radar phosphor green.
  strokeColor: 0x33ff66,
} as const

export const CITY = {
  /**
   * City marker icon (the Lucide `building-2` glyph, the same icon the toolbar
   * uses for the cities toggle) — its edge length on screen in CSS pixels, held
   * constant across zoom.
   */
  iconScreenSize: 15,
  /**
   * On-screen edge length (CSS px) of each city's invisible click target that
   * opens its detail window. A touch larger than the icon so the small glyph is
   * comfortable to hit; held constant on screen (re-derived per zoom via
   * `screenPxToWorld`) like the icon itself. Mirrors `RADAR.hitTargetScreenSize`.
   */
  hitTargetScreenSize: 26,
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

// Airfield markers.
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
} as const

// Air-defence radar sites.
export const RADAR = {
  /** Circle radius on screen (CSS pixels), held constant across zoom. */
  markerScreenRadius: 4,
  /**
   * On-screen edge length (CSS px) of each site's invisible click target. Larger
   * than the drawn marker so the small circle is comfortable to hit; held constant
   * on screen (re-derived per zoom via `screenPxToWorld`) like the marker itself.
   */
  hitTargetScreenSize: 24,
  /** Circle outline width on screen (CSS pixels). */
  strokeScreenWidth: 1.25,
  /** Marker colour — the circle outline (HUD: white). */
  color: 0xffffff,
  /** Label text colour. */
  labelColor: '#ffffff',
  /** Label font size on screen (CSS pixels) — site name and model, stacked. */
  labelScreenSize: 11,
  /** Clear gap between the circle and the bottom of the label (CSS pixels). */
  labelScreenGap: 3,
  /**
   * Zoom at/above which the radar labels (site name + model) appear. Below it only
   * the range rings show. Set a little below the airport reveal (14) — the sites
   * are sparse, so naming them earlier doesn't clutter — while staying inside the
   * reachable range (`ZOOM.min`..`ZOOM.max` = 6.5..40).
   */
  labelRevealZoom: 11,
  /**
   * The animated coverage sweep (see the "Every-frame / animated" reaction-pattern note
   * in `apps/game/CLAUDE.md`): its geometry is a real-world distance (km × `pixelsPerKm`),
   * so it lives in world space and zooms with the map — only the stroke widths below are
   * constant on screen.
   *
   * Drawn in phosphor green (`MAP.strokeColor`), not white — a deliberate,
   * user-requested exception to the HUD white/black rule so the sweep reads as part of
   * the tactical radar picture alongside the borders. See the HUD colour rule in the
   * root `CLAUDE.md`.
   */
  sweep: {
    /** Sweep-hand line width on screen (CSS pixels), held constant across zoom. */
    lineScreenWidth: 1.25,
    /** Range-ring line width on screen (CSS pixels). */
    ringScreenWidth: 1,
    /** Sweep + ring colour — phosphor green, matching the coastline (see above). */
    color: MAP.strokeColor,
    /** Sweep-hand opacity. */
    lineAlpha: 0.7,
    /** Range-ring opacity — faint, so it reads as a background extent marker. */
    ringAlpha: 0.12,
  },
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
   * 6.5..40) or the fade is inert: a band below `ZOOM.min` leaves `smoothstep`
   * pinned at 1 (grid always fully on), a band above `ZOOM.max` pins it at 0
   * (grid never shows). Here it starts a little above the initial framing zoom
   * (6.5) so the map opens grid-free, then the grid appears as the player zooms
   * closer in. Tunable within that range to taste.
   */
  fadeStartZoom: 8,
  fadeEndZoom: 16,
} as const

// Explicit draw order (higher renders on top).
export const DEPTH = {
  grid: 0,
  coastline: 10,
  // Radar coverage sweeps sit just above the coastline but beneath every marker
  // layer: the large, faint rings and rotating hands wash behind the city/airport/
  // radar glyphs so those stay legible on top.
  radarSweep: 15,
  cityDots: 20,
  cityLabels: 30,
  // Airports sit just above the city labels so their markers/labels aren't
  // hidden under a nearby city's name.
  airportMarkers: 40,
  airportLabels: 50,
  // Radar sites sit above the airfields: the circles and their name/model labels
  // are sparse infrastructure that should read on top of the denser airport
  // markers below them.
  radarMarkers: 60,
  radarLabels: 70,
  hud: 100,
  // Interactive chrome sits above the read-only telemetry HUD; the icon draws
  // one step above its own button surface.
  toolbarButton: 110,
  toolbarIcon: 111,
  // The developer console: a fixed bottom-left HUD panel that sits above the
  // toolbar but below the detail windows, so a dragged window can be raised over
  // it. Panel surface first, its text/controls one step above.
  consolePanel: 115,
  consoleContent: 116,
  // The site detail window (opened by clicking a marker) overlays everything,
  // including the toolbar: its panel surface first, then its text and controls
  // one step above so they read on top of the panel.
  window: 120,
  windowContent: 121,
  // The `/subwoofer` easter-egg image overlays the entire scene, above every
  // panel and window, for the brief moment it plays.
  subwoofer: 200,
} as const

export const HUD = {
  /** Debug readout font size on screen (CSS pixels). */
  fontScreenSize: 13,
  /** Debug readout inset from the top-right corner (CSS pixels). */
  marginScreen: 10,
} as const

/**
 * Top-left toolbar of icon buttons (currently cities, airports, radars, and
 * developer). The first three toggle the whole marker layer (glyphs + labels); the
 * developer button toggles the console. On/off state is shown through *alpha* (a
 * dimmed vs full-strength glyph), never a colour change.
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
 * The site detail window: a HUD panel that opens when the player clicks a marker
 * (currently radar sites; designed to serve towns and airfields too). All sizes
 * are CSS pixels, converted with `DPR` at render time. Chrome stays white/black
 * per the HUD rule. The window is type-agnostic — it renders a title, an
 * optional photo (the real site photo when one exists, else a "NO IMAGE"
 * placeholder box) with an attribution caption, and a list of label/value rows
 * supplied by the caller — so a new entity type only needs its own row list,
 * not a new window.
 */
export const INFO_WINDOW = {
  /** Panel width on screen (CSS pixels); height grows to fit its content. */
  widthScreen: 300,
  /** Inset of the panel from the top-left corner (CSS pixels). */
  marginScreen: 10,
  /** Inner padding between the panel edge and its content (CSS pixels). */
  paddingScreen: 14,
  /** Panel surface fill — solid black (fully opaque), with white borders. */
  panelColor: 0x000000,
  panelAlpha: 1,
  /** Panel + inner borders (white), width (CSS pixels) and opacity. */
  borderColor: 0xffffff,
  borderScreenWidth: 1,
  borderAlpha: 0.8,
  /** Title (site name) font. */
  titleColor: '#ffffff',
  titleFontWeight: '600',
  titleFontScreenSize: 17,
  /** Field label font (small, uppercased heading above each value). */
  labelColor: '#ffffff',
  labelFontWeight: '600',
  labelFontScreenSize: 10,
  labelAlpha: 0.6,
  /** Field value font. */
  valueColor: '#ffffff',
  valueFontWeight: '400',
  valueFontScreenSize: 13,
  /** Image box height (CSS pixels); holds the real photo or the placeholder + its caption. */
  imageHeightScreen: 130,
  imageFillAlpha: 1,
  imageCaption: 'NO IMAGE',
  imageCaptionFontScreenSize: 11,
  imageCaptionAlpha: 0.5,
  /** Inset (CSS px) of the photo's attribution caption from the image box corner. */
  imageCaptionInsetScreen: 5,
  /** Opacity of the photo attribution caption (a touch brighter than the placeholder). */
  imageCreditAlpha: 0.7,
  /** Close button square edge and its "×" glyph size (CSS pixels). */
  closeButtonScreenSize: 22,
  closeGlyphFontScreenSize: 18,
  /**
   * Close-button hover state (see `InfoWindow.setCloseHovered`): the square fills
   * with the border white at this alpha and its "×" glyph flips to black for
   * contrast — both inside the HUD white/black rule. At rest the button matches
   * the panel surface instead.
   */
  closeButtonHoverFillAlpha: 1,
  closeGlyphHoverColor: '#000000',
  /** Gap between the close button and the title (CSS pixels). */
  closeTitleGapScreen: 8,
  /** Vertical gap between major sections — header / image / fields (CSS pixels). */
  sectionGapScreen: 12,
  /** Gap between a field's label and its value (CSS pixels). */
  labelValueGapScreen: 2,
  /** Gap between consecutive fields (CSS pixels). */
  rowGapScreen: 9,
  /**
   * Each click opens a fresh window; successive windows are offset by this much
   * (CSS pixels) down-and-right so they cascade instead of landing exactly on top
   * of one another, then wrap back to the start after `cascadeCount` steps.
   */
  cascadeStepScreen: 28,
  cascadeCount: 8,
} as const

/**
 * The developer console: a draggable HUD panel (opening docked at the bottom-left)
 * that renders the shared logger's buffer (`src/log/logger.ts`) as a scrollable
 * text log, toggled by the toolbar's developer button or the "/" key. All sizes are CSS pixels,
 * converted with `DPR` at render time. Chrome stays white/black per the HUD rule; log lines
 * are coloured by level (`levelColors`) — the sanctioned HUD-colour exception for the console.
 */
export const CONSOLE = {
  /** Panel size on screen (CSS pixels) — fixed; the log scrolls within it. */
  widthScreen: 520,
  heightScreen: 260,
  /** Inset of the panel from the bottom-left corner (CSS pixels). */
  marginScreen: 10,
  /** Inner padding between the panel edge and its content (CSS pixels). */
  paddingScreen: 12,
  /** Panel surface fill — black, slightly translucent so the map reads behind it. */
  panelColor: 0x000000,
  panelAlpha: 0.85,
  /** Panel + close-button borders (white), width (CSS pixels) and opacity. */
  borderColor: 0xffffff,
  borderScreenWidth: 1,
  borderAlpha: 0.8,
  /** Header title ("CONSOLE") font. */
  title: 'CONSOLE',
  titleColor: '#ffffff',
  titleFontWeight: '600',
  titleFontScreenSize: 13,
  /** Gap between the header row and the top of the log viewport (CSS pixels). */
  headerGapScreen: 8,
  /** Log line font (small; the message body). */
  logColor: '#ffffff',
  logFontWeight: '400',
  logFontScreenSize: 12,
  /**
   * Per-level log-line colour. The developer console is a debugging tool, not
   * tactical chrome, so it is the sanctioned exception to the white/black/green
   * HUD rule (see root CLAUDE.md): severity is read at a glance by hue. `info` is
   * plain white; `warn`/`error` escalate; `debug` is dimmed (no source emits it
   * today, but the level stays supported).
   */
  levelColors: {
    debug: '#8a8a8a',
    info: '#ffffff',
    warn: '#ffcc00',
    error: '#ff5555',
  },
  /**
   * Command input row pinned below the log viewport. The prompt precedes the
   * typed text; a block caret blinks at the end while the console is open. Typing
   * routes to the command registry (see `src/commands/`) on Enter.
   */
  inputPrompt: '> ',
  inputColor: '#ffffff',
  inputGapScreen: 6,
  caretWidthScreen: 7,
  caretBlinkMs: 530,
  /** Extra leading between log lines (CSS pixels). */
  lineSpacingScreen: 3,
  /** Scroll bar (right edge of the log viewport). White per the HUD rule; the
   * track is faint, the draggable thumb brighter. */
  scrollbarWidthScreen: 5,
  scrollbarGapScreen: 6,
  scrollbarMinThumbScreen: 24,
  scrollbarTrackAlpha: 0.15,
  scrollbarThumbAlpha: 0.55,
  scrollbarThumbHoverAlpha: 0.85,
  /** Close button square edge and its "×" glyph size (CSS pixels). */
  closeButtonScreenSize: 20,
  closeGlyphFontScreenSize: 16,
  /** Close-button hover: fills white, glyph flips black (see `InfoWindow`). */
  closeButtonHoverFillAlpha: 1,
  closeGlyphHoverColor: '#000000',
  /**
   * `deltaY` magnitude that counts as one full wheel notch. Log lines scrolled
   * per notch is `wheelLinesPerNotch`, scaled by the actual delta relative to
   * this and floored at one line. Wheel events over the panel scroll the log
   * and are swallowed so the map underneath doesn't also zoom.
   */
  wheelDeltaPerNotch: 100,
  wheelLinesPerNotch: 3,
} as const

/**
 * The `/subwoofer` easter egg — a photo shown centred on screen while a sound
 * plays, then faded out. The image is a real photograph, the sanctioned
 * photographic-imagery exception to the white/black HUD rule (see root CLAUDE.md).
 */
export const SUBWOOFER = {
  /** Longest image edge as a fraction of the smaller viewport dimension. */
  maxScreenFraction: 0.6,
  /** Fade in/out duration (ms). */
  fadeMs: 200,
} as const

// ── Camera & input ─────────────────────────────────────────────────────────
// Zoom limits, keyboard pan speed, and the geographic play-area bounds. The
// zoom limits and centre bounds are LOCKED game settings — see the "Camera
// bounds are locked" rule in `apps/game/CLAUDE.md`.

/**
 * Camera zoom limits and wheel response.
 * `step` is the zoom factor applied by one full wheel notch; `deltaPerStep` is the
 * `deltaY` magnitude that counts as one notch. Scaling the factor by the actual delta
 * (rather than a fixed step per event) keeps a trackpad — which fires a rapid stream of
 * small-delta events — from compounding into runaway zoom.
 */
export const ZOOM = { min: 6.5, max: 40, step: 1.12, deltaPerStep: 100 } as const

/**
 * Max pointer travel (CSS pixels, press → release) still treated as a click
 * rather than a drag. A click on a site marker opens its detail window; drag past
 * this and it's a camera pan, which must not open the window. Kept small so a
 * deliberate tap opens the window but the tail end of a pan never does.
 */
export const CLICK_MAX_TRAVEL_SCREEN = 6

/**
 * Keyboard pan speed as CSS pixels/second on screen (held constant across zoom
 * by dividing the world step by the current zoom).
 */
export const KEY_PAN_SPEED = 700

/**
 * The play area: fixed limits for where the camera CENTRE (the world point it
 * looks at) may roam, as a geographic lon/lat box (WGS84). Sized to the full
 * radar-coverage footprint so the player can pan out over all the watched
 * airspace; `MainScene` projects these four corners via `project()` at load
 * (GPS is the source of truth — never pixel bounds).
 *
 * LOCKED — widened from the original Denmark-only box at the user's explicit
 * request (2026-07-08) to reveal the radar coverage. Do not change these values
 * (or the ZOOM min/max above) without a fresh explicit request. See the "Camera
 * bounds are locked" rule in `apps/game/CLAUDE.md`.
 */
export const CAMERA_CENTER_BOUNDS = {
  /** Longitude (°E) extents — out to the west/east edges of the radar coverage. */
  west: 2,
  east: 23,
  /** Latitude (°N) extents — from below Bornholm's reach up past Skagen's. */
  south: 50,
  north: 62,
} as const

/**
 * The lon/lat the map is framed on at startup (central Denmark), kept separate
 * from `CAMERA_CENTER_BOUNDS` so the roam box and the opening view stay
 * independent (widening the box doesn't move where the map opens). WGS84. See
 * `apps/game/CLAUDE.md`.
 */
export const CAMERA_INITIAL_CENTER = {
  lon: 10.75,
  lat: 56,
} as const
