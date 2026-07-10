# Game app rules for Claude (`sector-north-game`)

These are the working conventions for the Phaser app in this directory. The project-wide
rules (GPS is the source of truth, fail fast, pnpm only, HUD white/black only) live in
the repo-root `CLAUDE.md` and apply here in full.

## Boot sequence

`index.html` provides fixed build-time markup — a `#game` mount and a `#loader` boot
overlay. `src/main.ts` assumes both exist: it resolves them via `requireElement()` and
throws immediately if either is missing, rather than treating a missing DOM node as a
runtime/degraded state. Before the Phaser game is even created, boot first
`await loadHudFont()`s — loading the self-hosted @fontsource Chakra Petch weights
(400/600, declared once in `HUD_FONT_WEIGHTS`) and throwing loudly if any weight never
resolves, because Phaser rasterises text onto a canvas and a missing face would silently
fall back to the wrong typeface. A boot failure is surfaced into the mount's `textContent`
and then re-thrown, rather than left as a silent black screen. The loader teardown is
registered as a listener for `APP_READY_EVENT` *before* Phaser's async `create()` can run,
and is only torn down once that event fires (world projected; toolbar + city SVG glyphs,
city + radar photos, and world-data JSON all loaded) — never on a timer or guess.

## Module layout — keep the boundary

- `src/map/` — **world data + projection.** Pure TypeScript, no Phaser imports.
  - `geojson.ts` / `cities.ts` / `airports.ts` / `radars.ts` — load and strictly validate the
    bundled data (throw on any structural surprise; the data is a fixed build-time
    asset, so anything unexpected is a bug we want to see immediately). Validation is
    not just structural: every lon/lat is range-checked against WGS84 bounds
    (lon −180..180, lat −90..90) and rejected if non-finite, so a swapped or corrupt
    coordinate fails fast at load rather than projecting to a wrong pixel.
  - `project.ts` — the projection layer (see below).
- `src/game/` — **Phaser rendering + input.** Consumes projected output; never parses
  GeoJSON or re-derives the projection. Within it, keep the small pure-helper modules
  separate so each has one reason to change: `math.ts` (generic, domain-agnostic math —
  no Phaser/projection/game knowledge), `units.ts` (screen↔world pixel scaling), and
  `camera.ts` (camera → world-view geometry). `radarImages.ts` and `cityImages.ts` hold the
  name → photo-asset join for radars and cities respectively — the seam between world data
  and the bundled photos. Keeping them here deliberately leaves `src/map/radars.ts` and
  `src/map/cities.ts` pure world data with no asset URLs. Both maps are allowed to be partial:
  `radarImageAsset`/`cityImageAsset` return `null` rather than throwing for an entry with no
  photo — a genuinely image-less case, not a missing asset; keep that fail-fast-exception
  note inline. (The radar map is partial today — only some sites have a licensed photo; every
  current city has one, but the same null contract still holds for a future photo-less city.)
- `src/data/` — bundled data assets. Coordinates are lon/lat (WGS84); prefer simplified
  geometry (fewer points = faster to draw). Every dataset is imported the same way — via
  Vite `?url`, so each file is emitted to `dist/` and fetched at runtime (through Phaser's
  loader into the JSON cache) rather than inlined into the JS bundle. `MainScene.preload()`
  requests each URL; the `src/map/` loaders validate the parsed JSON handed to them in
  `create()`. To keep the small datasets (`major-cities.json` ~0.6 KB, `radars.json`
  ~2.6 KB) from being inlined as base64 data URIs under Vite's default 4 KB threshold,
  `vite.config.ts` sets `assetsInlineLimit` to force all `.json` assets to emit as files.
  - Country boundaries — `borders/*.json` (currently belgium, czechia, denmark, france,
    germany, latvia, lithuania, netherlands, norway, poland, russia, slovakia, sweden,
    united-kingdom); `geojson.ts` exposes them as `BOUNDARY_ASSETS` and validates each.
  - `major-cities.json`, `airports.json` and `radars.json` — each exposes a
    `*_ASSET` ({ cacheKey, url }) from `cities.ts` / `airports.ts` / `radars.ts`, which
    also parse and validate the fetched JSON.
    - A city record carries **researched flavour metadata** (`region`, `founded`, `notes`)
      alongside its `population`. These are surfaced in the city detail/info window that
      opens on click (with the city's landmark photo from `cityImages.ts`); kept strictly
      validated and in sync with `major-cities.json`. `founded` is free text (a year or a
      century, e.g. `"1868"` / `"11th century"`) since Danish cities' origins are dated at
      very different precisions.
    - An airport's `tier` (`major` / `minor` / `military`) is a coarse importance tier
      **carried directly as a field on each entry in the bundled `airports.json`**; the
      render layer reads it to decide what shows at which zoom (majors + airbases always,
      minor strips only once zoomed in — see the reveal-zoom rule under rendering).
    - A radar record also carries **researched flavour/spec metadata** (`manufacturer`,
      `origin`, `type`, `dimensionality`, `band`, `altitudeCeilingKm`, `notes`). These are
      now surfaced in the radar detail/info window that opens on click; they are kept
      strictly validated and in sync with `radars.json`. The `dimensionality`/`band`/
      altitude values are still reserved for the future 2D-vs-3D altitude / band-based
      gameplay mechanics discussed for later. `altitudeCeilingKm` is `null` for a 2D
      sensor: an honest "not applicable", never a masked missing value.

Co-located sites are **never collapsed** — no marker is merged away or moved to a
midpoint. `loadAirports()` just parses and validates; every airfield keeps its own glyph
(a military airbase and its co-located civil airport stay two triangles; a radar on the
same base stays its own circle). Only their *labels* are combined, so the map still shows
each physical thing while decluttering overlapping text.

`colocate.ts` holds that shared, type-agnostic co-location logic, split into two steps:
`clusterByProximity` groups *any* POIs within `COLOCATION_RADIUS_KM` (single-linkage,
computed once), and `resolveColocationLabels` turns those clusters into one label per
item **given which items are currently visible**. Within a cluster only the shown members
count: the lowest-`priority` visible one owns the label and shows its name with a `" +N"`
badge for the rest (its glyph and theirs still draw); everyone else is suppressed. So
toggling a layer off drops both its glyph and its share of the `+N`, and can hand
ownership to a lower-priority site still shown. `MainScene` supplies the ranking (military
airfield < major < minor < radar, so a base's own name beats the radar on it), holds the
live per-layer visibility flags, and re-runs `resolveColocationLabels` → `layer.setLabels`
on every airport/radar toggle. The radius is a **real-world km distance**, so it lives in
`colocate.ts` (the world layer, in km) — not in `config.ts`, which holds only on-screen
pixel constants. This is the "GPS is the source of truth" rule applied to a data transform:
proximity is judged in real geographic distance, never pixels. The `COLOCATION_RADIUS_KM`
value (6 km) is calibrated empirically: it merges the airfield + radar + civil airport that
share a single Danish air base, yet keeps genuinely separate sites apart (e.g. the Bornholm
radar ~10 km from Bornholm airport stays its own site).

New code must respect this split: geographic reasoning goes in `src/map/`, drawing and
input go in `src/game/`.

- `src/log/` — **pure, framework-free logging.** `logger.ts` is a process-wide `Logger`
  singleton with no Phaser/rendering knowledge; any module can call `log.info(...)` etc.
  without threading an instance through. It holds a bounded newest-500 ring of entries,
  broadcasts them via `subscribe`/`snapshot`, throws on an empty message, and mirrors every
  entry to the matching browser-console method (`CONSOLE_METHOD`) as a deliberate second
  sink. It knows nothing about how entries are drawn. `src/game/ConsoleWindow.ts` is the sole
  *in-game* consumer and owns all timestamp/level formatting; each line is coloured by level
  (see the console bullet below). The four levels exist, but **`debug` has no callers** — the
  routine per-event chatter was removed rather than filtered, so a `debug` call reappearing is
  a deliberate choice, not leftover noise. Reserve `info` for one-time lifecycle milestones
  (boot steps, world-data loaded, scene ready), `warn`/`error` for genuine problems.
- `src/commands/` — **pure, framework-free command registry.** `registry.ts` exports a
  `Command` interface and a process-wide `commands` singleton any module can import to
  `register(...)` a slash-command, plus `parseCommandLine`. It knows nothing about Phaser: a
  command needing game state (audio, a scene, layers) is registered from `src/game/` and
  captures what it needs by closure — that is why `/subwoofer` lives in `MainScene`, not here.
  `/help` ships with the registry (it just lists the live command set). `ConsoleWindow`'s input
  row is the one caller that dispatches typed lines through it. Duplicate/invalid names throw
  at registration (fail fast) rather than silently shadowing.

## The projection layer (`src/map/project.ts`)

The heart of the "GPS is the source of truth" design — the **only** place that knows how
lon/lat becomes pixels.

- **The fit is pinned to a fixed frame, not to whatever is loaded.** `projectToPixels`
  takes an optional third `fitGeometry` argument; the scale, origin, `pixelsPerKm`, and
  therefore the projected camera bounds are computed from *that* set only, while all of
  `geometry` is drawn through the resulting projector. `MainScene` passes
  `PROJECTION_FRAME_ASSETS` (the original Denmark-centred six: denmark, germany,
  netherlands, norway, poland, sweden) as the frame. **This is load-bearing for the locked
  zoom:** the map's scale and the projected `CAMERA_CENTER_BOUNDS` depend on the fit, so
  adding a country to `BOUNDARY_ASSETS` for context (belgium, france, the Baltics, russia,
  etc.) draws it *without* rescaling the map or changing the zoom. Never fold context
  boundaries into the frame, and never fit to the full geometry — either silently changes
  the zoom, which is a locked setting (see the camera-bounds rule below).
- `projectToPixels(geometry, viewport, fitGeometry?)` fits `fitGeometry` (default:
  `geometry`) to the viewport **once** and returns:
  - `project(lon, lat)` — the single lon/lat → pixel transform. Every overlay (city
    markers, future aircraft, anything placed on the map) must route through this
    function rather than re-deriving the fit.
  - `pixelsPerKm` — valid on both axes thanks to the latitude correction. Use it to
    express real distances (grid cells, ranges, speeds) in the render; never invent a
    separate pixels-per-km factor.
  - `bounds` — the drawn geometry's pixel bounding box; its top-left corner
    (`x`/`y`) anchors the grid origin. (Camera bounds are separate: projected from
    `CAMERA_CENTER_BOUNDS` via `project()`, not derived from this box.)
  - `polygons` — the projected geometry as one flat `Float32Array` per ring (interleaved
    `[x0, y0, x1, y1, …]` device pixels), chosen to be compact and cache-friendly for the
    drawing layer to iterate.
- The projection is equirectangular with a `cos(meanLatitude)` longitude correction —
  cheap and accurate enough for a country-scale map. If/when exact real-speed simulation
  demands more accuracy, the sanctioned upgrade is projecting through **UTM zone 32N
  (EPSG:25832)** (the standard Danish grid, yields meters directly) via `proj4` — done
  *inside this module*, so nothing else changes.

## Rendering & scene conventions

- **Project once; the camera owns pan/zoom.** The world is projected a single time at
  scene creation. All subsequent zoom/pan goes through the Phaser camera
  (`CameraController`) — never re-project the world model in response to camera moves.
- **`MainScene` is a composition root only.** It loads/projects the world, wires up the
  layers, camera controller, and HUD, and forwards signals (update tick, resize, zoom
  change). Rendering and input logic belong in the layer/controller classes, not in the
  scene.
- **Three reaction patterns for layers — pick the right one:**
  - *Zoom-reactive* (coastline stroke width, city / airport / radar marker/label sizing):
    refreshed via the camera controller's `onZoomChanged` fan-out in `MainScene`. New
    zoom-reactive layers are added to that one callback, not wired at individual call sites.
    Every such layer's constructor also calls its own `onZoomChanged(currentZoom)` once,
    immediately after creating its game objects (AirportLayer, CityLayer, CoastlineLayer,
    RadarLayer all follow this identical constructor-call pattern) — so the layer is fully
    and correctly rendered before any input or camera event fires, rather than left to a
    separate first-draw step the caller must remember. The rationale now lives here rather
    than being duplicated inline in each layer. Each also validates the camera zoom is
    finite and strictly positive before deriving any on-screen size via `screenPxToWorld`,
    via an identical `assertZoom` helper across AirportLayer, CityLayer, and RadarLayer —
    throwing rather than silently producing Infinite/NaN geometry from a zero/NaN/negative
    zoom.
  - *Viewport-reactive* (grid slice, HUD readout): runs in `update`, guarded by the
    camera-moved dirty check so idle frames do no work. Remember that a window resize
    changes the viewport without moving the camera — handle it in `onResize`.
  - *Every-frame / animated* (`RadarSweepLayer`): redraws every frame *while visible* off the
    scene's `update` tick — gated only by its own visibility (the radar toolbar toggle), not by
    the camera-moved dirty check — because its content is intrinsically time-varying. This
    is cheap here only because there are a handful of sites; reach for it just for genuinely
    animated content, not to dodge the dirty-check discipline above. Because all its geometry
    is world-space (km → pixels via `pixelsPerKm`), a sweep covers the same patch of ground at
    every zoom, so — unlike the static marker layers — it needs no zoom handler / `onZoomChanged`
    wiring: only the stroke widths are re-derived per frame (via `screenPxToWorld`) to hold a
    constant on-screen thickness. **Clutter reduction:** every site's sweep angle still advances
    every frame while visible, but only a single site actually draws its range ring and sweep
    hand each frame — the rest advance silently off-screen. The drawn site is coverage-first
    (`RadarSweepLayer.selectSweepIndex`): a radar whose range ring *contains* the view centre
    beats one that doesn't (so a nearer but smaller-range radar loses to a farther radar you're
    actually inside), and the physically nearest breaks ties within a containment tier; if the
    centre is inside no ring, the nearest overall is drawn so a sweep always shows. Angles are
    never reset when a site gains or loses the "drawn" status, so whichever site becomes the
    drawn one is already at its correct, continuous phase rather than snapping to zero; the
    starting angles are staggered at construction (one full turn spread evenly across the sites)
    for the same reason on the very first frame.
- **Two cameras:** the main camera draws only world layers; a fixed UI camera (zoom 1, no
  scroll) draws only the HUD, so HUD elements keep a constant on-screen size. Each camera
  `ignore()`s the other's objects. Register any new object with the correct camera.
- **Detail/info windows are per-location HUD panels on the UI camera.** At most one window
  exists per location; clicking a location *toggles* it (open a fresh one, or close the
  existing one). New windows cascade so they don't stack exactly on top of each other, and
  a click or drag raises a window to front; its close button disposes it. Each window is
  its own draggable instance that owns its position and lives on the fixed UI camera, so it
  keeps a constant on-screen size like the rest of the HUD. Because windows are created
  *after* `setupCameras` runs, `InfoWindowManager` must route each new window's objects to
  the UI camera itself and have the world camera `ignore()` them — a HUD object otherwise
  renders on every camera. This is a concrete instance of the two-camera rule above.
  Window content (`InfoWindowContent`) is **entity-agnostic**: a record maps into the same
  title / fields / optional-image shape, so the window component never learns about entity
  types. The city (`cityWindowContent`) and radar (`radarWindowContent`) builders are wired
  — clicking a city or radar marker toggles its window; airfields are not yet clickable. Each
  layer owns one invisible interactive hit `Zone` per marker (held at a constant on-screen
  size, disabled when the layer is hidden) that distinguishes a click from a drag by pointer
  travel, so a camera pan ending over a marker never opens a window. The entity-agnostic
  shape is what lets each new type get its own content builder without editing the window.
- **The developer console (`ConsoleWindow`) is a draggable HUD panel** on the fixed UI
  camera (constant on-screen size). The toolbar's developer button toggles it; the "/"
  (forward-slash) key *opens* it (once open, "/" is a command prefix the input row captures,
  so it must not toggle shut — close with the × button, the toolbar glyph, or Escape). The
  open/close paths funnel through `MainScene.setConsoleOpen()` so the window, the toolbar
  glyph, and the key never drift; it starts closed. It renders the shared `src/log/logger.ts`
  buffer as a scrollable text log, docked bottom-left when opened. **Log lines are coloured
  by level** (`CONSOLE.levelColors`) — the sanctioned exception to the white/black/green HUD
  rule (see root CLAUDE.md), because the console is a debugging tool, not tactical chrome.
  - **Clipping + colour via a fixed Text pool.** There is one `Text` object *per visible
    viewport row* (the pool is sized once from the fixed panel height — the panel never
    resizes, only its origin moves on drag), each carrying its own colour, since a single
    `Text` is one colour. Clipping is by content, not a mask or crop: each pooled row only
    holds the one wrapped line currently at its slot, because Phaser `crop` lands in the wrong
    space for a DPR-scaled Text texture and geometry masks were unreliable across the
    two-camera setup — both were tried and rejected. An off-screen `measure` Text does the
    per-entry word-wrap. **The pool must be created before `setupCameras`** — a Text made
    afterwards renders on both cameras.
  - Scroll position is an offset into the wrapped lines with a draggable scrollbar reflecting
    it; the view auto-follows the newest line until the user scrolls up, then holds until they
    return to the bottom.
  - **A command input row** is pinned below the log (prompt + typed text + blinking caret).
    While the console is open it captures keystrokes (`ANY_KEY_DOWN`) and `MainScene` suspends
    the camera's keyboard pan (`CameraController.setKeyboardPanEnabled`) so typing a command
    doesn't also drive the map. Enter dispatches the line through the `src/commands/` registry
    (echoed as `> …`, then the command's output logged, or a `warn` for an unknown name);
    Backspace edits, Escape closes. The registry is the seam — see the `src/commands/` bullet.
- **Constant on-screen sizes** (hairline strokes, marker dots, pan speed) are computed
  with `screenPxToWorld(screenPx, zoom)` from `src/game/units.ts` — the single source of
  truth for the screen↔world scaling trick. Don't hand-roll `x * DPR / zoom`.
- **Draw order lives in `DEPTH` in `src/game/config.ts`.** Add new layers there; no
  scattered magic `setDepth` numbers.
- **Marker glyph language — distinguish by shape / size / fill, never colour** (the HUD
  white/black rule): cities draw as the Lucide `building-2` icon (the same glyph the
  toolbar's cities toggle shows, so a control and the thing it toggles read as one); airfields
  draw as triangles, with importance encoded by glyph *size* (major airports + military
  airbases large, minor fields small) and branch by *fill* (military solid, civil hollow);
  radars draw as a hollow circle. Every glyph is drawn while its layer is on — only the
  *names* reveal progressively by zoom: airfield majors/military at `AIRPORT.labelRevealZoom`,
  minor fields at the closer `AIRPORT.minorLabelRevealZoom`, and the (sparse) radars at a
  lower zoom than the airports. Radar coverage is drawn by the separate `RadarSweepLayer`
  (its own `DEPTH.radarSweep`, toggled together with the radar markers): a faint world-space
  range ring plus an animated rotating sweep hand, sized by the site's real `rangeKm` — the
  one HUD element in phosphor green (`MAP.strokeColor`), the sanctioned colour exception (see
  the root `CLAUDE.md` HUD rule and `RADAR.sweep`). Only one site draws its coverage each frame
  — see the coverage-first selection rule in the "Every-frame / animated" bullet above.
- **The coastline is drawn as world-space vectors, not a baked texture** — so the outline
  stays a crisp hairline at any zoom and the camera transform makes pan/zoom free (no
  per-frame re-tessellation). Its world-space line width is recompensated on zoom to hold a
  constant on-screen thickness.
- **The reference grid is a GPS-derived scale bar.** Because each cell is a fixed real-world
  size (`GRID.cellKm` × `pixelsPerKm`), cells stay square and constant on the ground, giving
  the player a readable scale even out over open water where no land is in view.
- **HUD controls are decoupled from what they control.** Each toolbar button owns its own
  on/off state and reports changes through the `onToggle` callback the scene supplies — it
  never reaches into the layers directly; `MainScene` owns that wiring.
- **HUD icons are SVGs baked into textures (`src/game/svgIcon.ts`).** HUD glyphs come from
  Lucide SVGs, authored with `currentColor`. A standalone SVG rasterised into a Phaser
  texture has no CSS colour context to inherit — it would fall back to black and vanish on
  the black map — so `iconDataUri` bakes the HUD white straight into the markup (per the
  white/black HUD rule) and hands Phaser a **base64** data URI. It must be base64, not
  percent-encoded: Phaser's SVG loader `atob`s the payload, and a percent-encoded URI makes
  `atob` throw so the loader stalls and never fires `create`. Icon markup must be pure ASCII
  (`btoa` throws otherwise) and must actually contain a `currentColor` to replace — both are
  treated as build-time bugs and throw, never degrade to an invisible/placeholder icon.
- **Tunable numbers live in `src/game/config.ts`**, in CSS pixels where they describe
  on-screen sizes. Logic lives in the layers; the numbers you might want to nudge live in
  config. Follow this split for new features.
- **Device pixels:** the canvas backing store is sized at `cssPixels * DPR` and scaled
  back via Phaser's `zoom` config, so all in-game coordinates are device pixels. Convert
  CSS-pixel config values with `DPR` (usually via `screenPxToWorld`). Every Phaser `Text`
  object created for a marker label (AirportLayer, CityLayer, RadarLayer) sets
  `resolution: DPR` in its style so the text rasterizes at device resolution and stays
  crisp on HiDPI displays — a standing convention, not a per-layer choice.

## Camera bounds are locked — never change them on your own

The zoom limits (`ZOOM.min` / `ZOOM.max`) and the camera-movement bounds
(`CAMERA_CENTER_BOUNDS`) in `src/game/config.ts` are **deliberately tuned game
settings**. Do **not** change these values, and do not alter the clamp logic in
`CameraController` that enforces them, unless the user explicitly asks you to in that
request. They are not free to "improve", refactor away, or adjust as a side effect of
another change. If a task seems to require different zoom/pan limits, stop and ask the
user first rather than editing them.

Note: `CAMERA_CENTER_BOUNDS` was widened from the original Denmark-only box to the full
radar-coverage footprint on 2026-07-08 **at the user's explicit request**, so the player
can pan out to see every radar's range. The opening framing is pinned separately by
`CAMERA_INITIAL_CENTER` (central Denmark) and passed to `CameraController` as
`initialCenter`, so the roam box and the start view are independent — widening the box does
not move where the map opens. The "locked" rule still stands for any *future* change:
don't touch either constant without a fresh explicit request.

The bounds are enforced by a **manual centre-clamp** (`CameraController.clampCamera`), not
Phaser's `camera.setBounds`. `setBounds` locks and re-centres the camera whenever the visible
area is larger than the bounds — which is the normal case here (a small country in a large
viewport) — and would forbid panning and fight the zoom-to-cursor anchor. The clamp instead
confines the camera *centre* (deriving `scroll = centre − size/2`), so the pannable region
stays the same at every zoom level rather than shrinking as you zoom in.
