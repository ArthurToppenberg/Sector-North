# Game app rules for Claude (`sector-north-game`)

These are the working conventions for the Phaser app in this directory. The project-wide
rules (GPS is the source of truth, fail fast, pnpm only, HUD white/black only) live in
the repo-root `CLAUDE.md` and apply here in full.

## Module layout — keep the boundary

- `src/map/` — **world data + projection.** Pure TypeScript, no Phaser imports.
  - `geojson.ts` / `cities.ts` / `airports.ts` — load and strictly validate the
    bundled data (throw on any structural surprise; the data is a fixed build-time
    asset, so anything unexpected is a bug we want to see immediately). Validation is
    not just structural: every lon/lat is range-checked against WGS84 bounds
    (lon −180..180, lat −90..90) and rejected if non-finite, so a swapped or corrupt
    coordinate fails fast at load rather than projecting to a wrong pixel.
  - `project.ts` — the projection layer (see below).
- `src/game/` — **Phaser rendering + input.** Consumes projected output; never parses
  GeoJSON or re-derives the projection.
- `src/data/` — bundled data assets. Coordinates are lon/lat (WGS84); prefer simplified
  geometry (fewer points = faster to draw). Two import mechanisms:
  - Country boundaries — `borders/*.json` (currently denmark, germany, netherlands,
    norway, poland, sweden) imported via Vite `?url`, so each file is emitted to `dist/`
    and fetched at runtime rather than inlined into the JS bundle; `geojson.ts` validates
    the parsed JSON.
  - `major-cities.json` and `airports.json` — imported via Vite `?raw` (inlined at build
    time and parsed by `cities.ts` / `airports.ts`).

`loadAirports()` does more than parse: it merges co-located fields. A military airbase
within `MILITARY_MERGE_RADIUS_KM` of a major civil airport is collapsed into a single
combined field — one large *military* marker labelled `"<civil> & <military>"`, placed at
the pair's midpoint (several Danish sites, e.g. Aalborg / Karup / Skrydstrup, share civil
and military runways a couple of km apart). The merge radius is a **real-world km
distance**, so it lives in `airports.ts` (the world layer, in km) — not in `config.ts`,
which holds only on-screen pixel constants. This is the "GPS is the source of truth" rule
applied to a data transform: proximity is judged in real geographic distance, never pixels.

New code must respect this split: geographic reasoning goes in `src/map/`, drawing and
input go in `src/game/`.

## The projection layer (`src/map/project.ts`)

The heart of the "GPS is the source of truth" design — the **only** place that knows how
lon/lat becomes pixels.

- `projectToPixels(geometry, viewport)` fits the mapped geometry (Denmark + its
  neighbours, as one combined MultiPolygon) to the viewport **once** and returns:
  - `project(lon, lat)` — the single lon/lat → pixel transform. Every overlay (city
    markers, future aircraft, anything placed on the map) must route through this
    function rather than re-deriving the fit.
  - `pixelsPerKm` — valid on both axes thanks to the latitude correction. Use it to
    express real distances (grid cells, ranges, speeds) in the render; never invent a
    separate pixels-per-km factor.
  - `bounds` — the drawn geometry's pixel bounding box; its top-left corner
    (`x`/`y`) anchors the grid origin. (Camera bounds are separate: projected from
    `CAMERA_CENTER_BOUNDS` via `project()`, not derived from this box.)
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
- **Two reaction patterns for layers — pick the right one:**
  - *Zoom-reactive* (coastline stroke width, city and airport marker/label sizing):
    refreshed via the camera controller's `onZoomChanged` fan-out in `MainScene`. New
    zoom-reactive layers are added to that one callback, not wired at individual call sites.
  - *Viewport-reactive* (grid slice, HUD readout): runs in `update`, guarded by the
    camera-moved dirty check so idle frames do no work. Remember that a window resize
    changes the viewport without moving the camera — handle it in `onResize`.
- **Two cameras:** the main camera draws only world layers; a fixed UI camera (zoom 1, no
  scroll) draws only the HUD, so HUD elements keep a constant on-screen size. Each camera
  `ignore()`s the other's objects. Register any new object with the correct camera.
- **Constant on-screen sizes** (hairline strokes, marker dots, pan speed) are computed
  with `screenPxToWorld(screenPx, zoom)` from `src/game/units.ts` — the single source of
  truth for the screen↔world scaling trick. Don't hand-roll `x * DPR / zoom`.
- **Draw order lives in `DEPTH` in `src/game/config.ts`.** Add new layers there; no
  scattered magic `setDepth` numbers.
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
