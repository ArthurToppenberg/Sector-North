# Sector-North

A browser game set on a real map of Denmark, built with [Phaser 4](https://phaser.io/),
[Vite](https://vitejs.dev/), and TypeScript.

🌐 **Play it live: [sectornorth.arthurtoppenberg.dk](https://sectornorth.arthurtoppenberg.dk)**

![Sector-North — the Danish coastline with city markers](docs/screenshot.png)

## Vision

> 🚧 Work in progress — everything below is the current working idea and is **subject to
> change** as the game develops.
>
> Sector-North is a present-day air-policing game played over a real, GPS-accurate map of
> Denmark. Russian aircraft — the kind actually intercepted over the Baltic today, like
> the Il-20M reconnaissance plane — probe the edges of Danish airspace. You watch them
> appear as radar contacts, scramble the current Danish air force to intercept and
> identify them, and escalate to a shoot-down only if it comes to that. Positions, speeds,
> and radar ranges are all real-world values simulated on real coordinates.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) (a current LTS or newer)
- [pnpm](https://pnpm.io/) — this repo is a pnpm workspace; **always use `pnpm`, never
  `npm` or `yarn`** (see `CLAUDE.md` for the project rules)

If you have Node but not pnpm:

```bash
corepack enable pnpm
```

### Run the game locally

From the repo root:

```bash
# Install all workspace dependencies
pnpm install

# Start the dev server (Vite, with hot reload)
pnpm dev
```

Then open the URL Vite prints (typically `http://localhost:5173`). You should see the
Danish coastline (with its neighbouring countries) plus city, airport, and radar-site
markers, with a single radar — normally the one whose coverage the current view
centre falls within — showing an animated coverage sweep and range ring sized to its real range —
scroll to zoom (anchored under the cursor), and pan by click-dragging or with
WASD / arrow keys. Click a city or radar-site marker to open a draggable detail
window — cities show their region, founding date, and notes with a landmark
photo; radar sites show their specs and a photo where available. The top-left
toolbar toggles the city, airport, and radar layers; the terminal icon (or the
`/` key) opens a draggable developer console that streams the game's log.

The console accepts slash commands — `/help` lists them. Try `/spawn-intruder`:
it sends an Il-20M down a Baltic probing route past Bornholm, visible only where
a radar sweep paints it. On localhost a second dev-toolbar row appears with a
waypoints toggle that overlays the planned routes of such aircraft; elsewhere,
reveal it with `/dev-tools true`.

### Other useful commands

```bash
pnpm build       # Type-check and build the game app
pnpm build:all   # Build every app/package in the workspace
pnpm typecheck   # Type-check the whole workspace
```

To target a single app directly, use pnpm filters, e.g.
`pnpm --filter sector-north-game dev`.

## Project layout

```
Sector-North/
├─ apps/
│  └─ game/                # The Phaser + Vite game app
│     ├─ src/map/          # World data loading + the projection layer (no Phaser)
│     ├─ src/game/         # Phaser scenes, layers, camera, HUD
│     ├─ src/log/          # Pure, framework-free logging (the shared Logger singleton)
│     ├─ src/commands/     # Pure, framework-free slash-command registry for the dev console
│     ├─ src/data/         # Bundled map data (country boundaries, cities, airports, radars)
│     └─ CLAUDE.md         # App-level architecture rules
├─ docs/                   # Repo documentation assets (screenshots, etc.)
├─ CLAUDE.md               # Project-wide rules (architecture, tooling, style)
├─ pnpm-workspace.yaml     # Workspace definition
└─ package.json            # Root scripts (dev/build/typecheck)
```

## Contributing

Contributions are welcome — see **[`CONTRIBUTING.md`](CONTRIBUTING.md)** for how to submit
a change and for the Contributor License Agreement (opening a PR accepts it).

Before writing code, read the two rule files — they are short and non-negotiable:

- **`CLAUDE.md`** (repo root) — the core architectural principle (*GPS is the source of
  truth*: the world model lives in real lat/lon and real units; pixels are derived by a
  single projection layer), plus tooling and style rules (fail fast — no fallbacks,
  newest package versions, pnpm only, HUD in white/black only).
- **`apps/game/CLAUDE.md`** — how the game app is structured: the `src/map` / `src/game`
  boundary, the projection layer's contract, and the scene/layer/camera conventions.

They are written for Claude Code but apply equally to human contributors.

## License

Sector-North is **source-available, not open source**. It is licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE.md): you may use, modify, and share it for
**noncommercial** purposes only — personal projects, study, hobby use, and non-profit or
educational use are all fine. **Commercial use — including selling it or any part of it,
or using it in a paid product or service — is not permitted.** See [`LICENSE.md`](LICENSE.md)
for the full terms and [`CONTRIBUTING.md`](CONTRIBUTING.md) for how this applies to
contributions.
