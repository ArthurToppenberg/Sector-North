# Game app rules for Claude (`sector-north-game`)

These are the working conventions for the Phaser app in this directory. The project-wide
rules (GPS is the source of truth, fail fast, pnpm only, HUD white/black only) live in
the repo-root `CLAUDE.md` and apply here in full.

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
  `camera.ts` (camera → world-view geometry). `radarImages.ts` holds the
  radar-name → photo-asset join — the seam between world data and the bundled photos.
  Keeping it here deliberately leaves `src/map/radars.ts` pure world data with no asset
  URLs. The map is intentionally partial (only sites with a licensed photo have an entry),
  so `radarImageAsset` returns `null` rather than throwing for a radar with no photo — a
  genuinely image-less case, not a missing asset; keep that fail-fast-exception note inline.
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
    constant on-screen thickness.
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
  types. Today only the radar builder (`radarWindowContent`) is wired — towns and airfields
  are not yet clickable; the entity-agnostic shape is what lets each get its own content
  builder later without editing the window.
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
  lower zoom than the airports. Each radar site also draws its coverage picture (with the
  radar layer): a faint world-space range ring plus an animated rotating sweep hand, both
  sized by the site's real `rangeKm` — the one HUD element in phosphor green (`MAP.strokeColor`),
  the sanctioned colour exception (see the root `CLAUDE.md` HUD rule and `RADAR.sweep`).
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
  CSS-pixel config values with `DPR` (usually via `screenPxToWorld`).

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
