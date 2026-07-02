# Sector-North

A browser game built with [Vite](https://vitejs.dev/) and [Phaser 4](https://phaser.io/),
set on a map of Denmark. The long-term goal is a simple *Air Defender*–style game.

Managed as a [pnpm](https://pnpm.io/) workspace (monorepo) so more apps and shared
packages can be added over time.

## Core principle: GPS is the source of truth

The entire game is built around **real-world geographic coordinates**, not screen pixels.
This is a hard architectural rule, not a nice-to-have:

- Every position in the world model — the map, points of interest, and (later) aircraft —
  is stored as a real GPS coordinate (latitude/longitude).
- Every speed is defined in real units (e.g. km/h) so plane and jet velocities can be
  simulated from real-life data.
- A single **projection layer** converts world coordinates into Phaser pixel coordinates
  for rendering. Nothing else in the game reasons about pixels.

Because pixels are derived, zoom and pan only affect the camera/projection — never the
world model. A plane always "is" at a real lat/lon; where it's *drawn* is a pure function
of that position plus the current view.

```
 world model (real GPS: lat/lon, km/h)
        │
        ▼
 projection layer  ── lat/lon → meters → pixels
        │
        ▼
 Phaser (draws pixels) ── camera handles zoom/pan
```

## MVP scope

The first milestone deliberately has **no gameplay loop**. The goal is only to get real
geographic data rendering on screen and to prove out basic player controls.

**In scope:**

- Render the outline (coastline) of Denmark from the bundled map data.
- Zoom in and out (mouse wheel).
- Pan the map by dragging.

**Explicitly out of scope (for later milestones):**

- Enemies, projectiles, or any combat.
- Score, lives, win/lose states.
- Cities, targets, or defensive structures.
- Sound and menus.

## Tech stack

| Concern      | Choice        | Why |
|--------------|---------------|-----|
| Package mgmt | pnpm workspace | Monorepo: room for more apps/packages, fast installs. |
| Build / dev  | Vite          | Fast dev server, instant HMR, trivial static build. |
| Rendering    | Phaser 4      | 2D framework with a built-in camera (zoom + pan) and physics for later. |
| Language     | TypeScript    | Phaser ships strong types; catches errors early. |

## Map data

The repo includes Denmark boundary data (source: [geoBoundaries](https://www.geoboundaries.org/)):

- `geoBoundaries-DNK-ADM0-all/` — full boundary dataset in several formats.
- `geoBoundaries-DNK-ADM0_simplified.geojson` — **use this one.** Fewer points = faster to draw.

The coordinates are longitude/latitude. Phaser draws in screen pixels, so the app must
**project** geo coordinates into pixel space (see *Core principle* above).

### The projection layer

This is the heart of the "GPS is the source of truth" design. It's a small, isolated
module with two responsibilities:

1. `geoToWorld(lon, lat) → { x, y }` — convert a GPS coordinate to a metric world
   coordinate (meters). This is what makes real speeds correct.
2. `worldToScreen({ x, y }) → { px, py }` — map world meters onto the canvas.
   Zoom/pan are applied here (or via the Phaser camera).

**Projection choice — pick one:**

- **Simple (fine to start):** equirectangular with a latitude correction. Scale longitude
  by `cos(latitudeCenter)` (≈ `cos(56°) ≈ 0.56` for Denmark) so east–west distances aren't
  stretched. No dependencies.
- **Accurate (recommended for real speed simulation):** project through **UTM zone 32N
  (EPSG:25832)**, the standard Danish grid. It yields meters directly, so converting
  `900 km/h` into per-frame movement is exact. Use [`proj4`](https://github.com/proj4js/proj4js)
  for the conversion.

> ⚠️ Do **not** feed raw lon/lat straight into pixel coordinates. At Denmark's latitude a
> degree of longitude is only ~56% as wide as a degree of latitude, so distances — and
> therefore simulated speeds — would be wrong.

### Rendering approach (MVP)

1. Load the *simplified* GeoJSON into the world model.
2. Run every coordinate through the projection layer to get pixels.
3. Draw the resulting polygon(s) with `Phaser.GameObjects.Graphics`.
4. Drive zoom and pan through the Phaser `Camera`, not by re-projecting the world model.

> Optional optimization: bake the projected coordinates into a static array once, so the
> game doesn't parse the GeoJSON at runtime. Keep the raw GPS values around too — they're
> the source of truth for POIs and movement.

## Getting started

Requires [pnpm](https://pnpm.io/). From the repo root:

```bash
# Install all workspace dependencies:
pnpm install

# Develop (starts the game app dev server):
pnpm dev

# Build the game app:
pnpm build

# Build every app/package in the workspace:
pnpm build:all
```

To work inside a single app directly, use pnpm filters, e.g.
`pnpm --filter sector-north-game dev`.

> Not yet installed: `proj4`, for the accurate UTM 32N projection (see *Projection layer*).
> Add it when you build the map: `pnpm --filter sector-north-game add proj4`.

## Project layout

```
Sector-North/
├─ apps/
│  └─ game/                      # Vite + Phaser app (MVP lives here)
│     ├─ index.html
│     ├─ src/main.ts             # Phaser game entry point
│     ├─ vite.config.ts
│     └─ package.json
├─ geoBoundaries-DNK-ADM0-all/   # Denmark map data (multiple formats)
├─ dk.json                       # Alternate Denmark GeoJSON
├─ pnpm-workspace.yaml           # workspace definition
├─ package.json                  # root scripts (dev/build)
└─ README.md
```

## Roadmap (post-MVP)

1. **MVP** — render Denmark, zoom + pan. *(current)*
2. Place static POIs (cities/targets) from their real GPS coordinates.
3. Spawn aircraft that move at real speeds (km/h) along real lat/lon paths.
4. Add the defend mechanic + collisions.
5. Score, lives, and game-over.
