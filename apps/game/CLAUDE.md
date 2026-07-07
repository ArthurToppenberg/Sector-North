# Game app rules for Claude (`sector-north-game`)

These are the working conventions for the Phaser app in this directory. The project-wide
rules (GPS is the source of truth, fail fast, pnpm only, HUD white/black only) live in
the repo-root `CLAUDE.md` and apply here in full.

## Module layout — keep the boundary

- `src/map/` — **world data + projection.** Pure TypeScript, no Phaser imports.
  - `geojson.ts` / `cities.ts` — load and strictly validate the bundled data
    (throw on any structural surprise; the data is a fixed build-time asset, so
    anything unexpected is a bug we want to see immediately).
  - `project.ts` — the projection layer (see below).
- `src/game/` — **Phaser rendering + input.** Consumes projected output; never parses
  GeoJSON or re-derives the projection.
- `src/data/` — bundled data assets (`denmark-boundary.geojson`, `major-cities.json`),
  imported at build time via Vite `?raw`. Coordinates are lon/lat (WGS84). Prefer
  simplified geometry: fewer points = faster to draw.

New code must respect this split: geographic reasoning goes in `src/map/`, drawing and
input go in `src/game/`.

## The projection layer (`src/map/project.ts`)

The heart of the "GPS is the source of truth" design — the **only** place that knows how
lon/lat becomes pixels.

- `projectToPixels(geometry, viewport)` fits the country to the viewport **once** and
  returns:
  - `project(lon, lat)` — the single lon/lat → pixel transform. Every overlay (city
    markers, future aircraft, anything placed on the map) must route through this
    function rather than re-deriving the fit.
  - `pixelsPerKm` — valid on both axes thanks to the latitude correction. Use it to
    express real distances (grid cells, ranges, speeds) in the render; never invent a
    separate pixels-per-km factor.
  - `bounds` — the drawn geometry's pixel bounding box (used for camera bounds).
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
  - *Zoom-reactive* (coastline stroke width, city marker/label sizing): refreshed via the
    camera controller's `onZoomChanged` fan-out in `MainScene`. New zoom-reactive layers
    are added to that one callback, not wired at individual call sites.
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
