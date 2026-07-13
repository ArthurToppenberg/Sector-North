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
 * Bottom-right simulation speed control: a radio row of text buttons (PAUSE /
 * 1x / 2x / 3x). Exactly one option is active at a time; its multiplier scales
 * the real frame delta before it reaches the world simulation (0 = paused).
 * Active state is shown through label alpha like the toolbar's glyphs — never
 * a colour change (HUD white/black rule).
 */
export const SPEED_CONTROL = {
  options: [
    { label: 'PAUSE', multiplier: 0 },
    { label: '1x', multiplier: 1 },
    { label: '2x', multiplier: 2 },
    { label: '3x', multiplier: 3 },
  ],
  /** Multiplier active at boot — must match one of `options`. */
  initialMultiplier: 1,
  /** Button size on screen (CSS pixels); uniform so the row reads as one control. */
  buttonWidthScreen: 46,
  buttonHeightScreen: 30,
  /** Inset of the row from the bottom-right corner (CSS pixels). */
  marginScreen: 10,
  /** Gap between adjacent buttons (CSS pixels). */
  gapScreen: 6,
  /** Label font (small, uppercase-style like the toolbar chrome). */
  fontScreenSize: 11,
  fontWeight: '600',
  labelColor: '#ffffff',
  /** Label opacity when the option is selected vs not (mirrors the toolbar). */
  labelActiveAlpha: 1,
  labelInactiveAlpha: 0.3,
  /** Button surface fill (black) and its resting / hover opacity. */
  buttonColor: 0x000000,
  buttonAlpha: 0.35,
  buttonHoverAlpha: 0.6,
  /** Button border (white), its width (CSS pixels) and opacity. */
  borderColor: 0xffffff,
  borderScreenWidth: 1,
  borderAlpha: 0.7,
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
  /**
   * Autocomplete ghost: the best prefix-matching command's remaining letters,
   * shown inline after the typed text and completed on Tab. Dimmed via alpha on
   * white (not a grey hue) so it stays within the white/black HUD rule for
   * console chrome — the level-colour exception covers only the log lines, not
   * the input row.
   */
  suggestionAlpha: 0.4,
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
