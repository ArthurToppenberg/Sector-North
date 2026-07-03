# Project rules for Claude

## Core architecture: GPS is the source of truth

The entire game is built around **real-world geographic coordinates**, not screen pixels.
This is a hard architectural rule, not a nice-to-have:

- Every position in the world model — the map, points of interest, and (later) aircraft —
  is stored as a real GPS coordinate (longitude/latitude, WGS84). Pixels are always
  *derived*, never stored as the primary representation. When an entity is placed on
  screen, keep its real lon/lat on the object (see how `CityMarker` carries `lon`/`lat`
  alongside its projected `x`/`y`).
- Every speed and distance is defined in real units (km/h, km) so movement can be
  simulated from real-life data. Never express a game-world quantity natively in pixels.
- A single **projection layer** (`apps/game/src/map/project.ts`) converts world
  coordinates into pixel coordinates for rendering. Nothing else in the game may reason
  about the lon/lat → pixel transform.
- Never feed raw lon/lat straight into pixel coordinates. At Denmark's latitude a degree
  of longitude is only ~56% as wide as a degree of latitude — uncorrected, distances and
  therefore simulated speeds would be wrong. The projection layer applies the
  `cos(meanLatitude)` correction.
- Zoom and pan only affect the camera/projection — **never the world model**. A plane
  always "is" at a real lat/lon; where it's *drawn* is a pure function of that position
  plus the current view.

```
 world model (real GPS: lat/lon, km/h)
        │
        ▼
 projection layer  ── lat/lon → pixels (latitude-corrected)
        │
        ▼
 Phaser (draws pixels) ── camera handles zoom/pan
```

App-level conventions (module layout, rendering/layer rules, tuning constants) live in
`apps/game/CLAUDE.md`.

## Always use the newest package versions

When adding or updating any dependency, always use the **latest stable version**.

- Before installing, check the current latest version (e.g. `pnpm view <pkg> version`)
  rather than relying on memory or a version from training data.
- Add packages with pnpm so the newest version is resolved:
  `pnpm --filter <app> add <pkg>` (or `pnpm add -w <pkg>` for root/workspace tooling).
- When touching an existing dependency, prefer upgrading it to the latest stable release.
- Do not pin to older majors unless there is a documented, explicit reason (note it here
  if so).

## Fail fast — no fallbacks

Write code that fails loudly and immediately when something is wrong. Avoid fallbacks at
all costs.

- Validate inputs and preconditions up front; throw / raise on anything unexpected.
- Do **not** silently swallow errors, substitute default/placeholder data, or `try/catch`
  just to keep going. Let it crash with a clear message.
- No "safe" defaults that mask a missing value (e.g. don't default a failed projection to
  `0,0` or a missing config to a guessed value) — surface the error instead.
- Prefer an explicit throw over returning `null`/`undefined` to signal failure.
- If a dependency, file, or environment value is missing, stop and report it — never
  degrade to a partial or fake result.

## Package manager

This is a **pnpm workspace**. Use `pnpm` only — never `npm` or `yarn`. Do not create
`package-lock.json` or `yarn.lock`; the lockfile is `pnpm-lock.yaml`.

## HUD colours — white or black only

All HUD elements must be rendered in **white or black only** — no other colours.

This covers any on-screen overlay drawn on top of the map/world: text readouts, debug
panels, city/place labels, marker dots, icons, and any other UI chrome.

- Fills and strokes for HUD graphics: `0xffffff` or `0x000000`.
- HUD text `color`: `#ffffff` or `#000000`.
- Do not introduce accent/status colours (reds, greens, etc.) for HUD, even for emphasis
  or state. Convey state through position, size, weight, or shape instead.
