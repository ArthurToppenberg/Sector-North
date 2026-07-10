# Project rules for Claude

## Never commit to main — always work on a branch with a PR

Committing directly to `main` is **never allowed**. All changes must land on `main`
through a pull request.

- **Always ask the developer for explicit permission before running `git commit`,
  `git push`, or opening a pull request.** Never commit, push, or create a PR on your own
  initiative — stage the work, show what you're about to do, and wait for a clear go-ahead
  each time. Prior approval for one commit/push/PR does not carry over to the next.
- Never `git commit` (or push) onto the `main` branch.
- **Before starting work**, get onto the right branch: either create a new branch whose
  name reflects the work you're about to do, or switch to an existing branch that already
  has an open PR for this line of work. Do all the work on that branch — never on `main`.
- **When you're done working on something**, ship it: if the branch already has an open
  PR, push the new commits to it; otherwise open a new PR from the branch.
- **Both commit messages and PR titles MUST follow**
  [Conventional Commits](https://www.conventionalcommits.org/) — no exceptions:
  `<type>(<optional scope>): <imperative, lower-case summary>` — e.g. `feat(map): add radar sweep`.
  - The message/title **must start with one of these `type` prefixes**, followed by
    `:` (or `(scope):`): `feat`, `fix`, `refactor`, `chore`, `docs`, `perf`, `test`,
    `build`, `ci`, `style`, `revert`. Pick the one that best describes the change.
  - The scope is optional and names the area touched, e.g. `feat(map):`, `docs(readme):`.
  - The summary is imperative and lower-case (`add radar sweep`, not `Added radar sweep`).
  - A commit or PR title that doesn't parse under this convention is not acceptable — fix
    it before committing or opening the PR.
- Write PR descriptions grounded in the actual diff — never invent motivation or claim a
  check you didn't run.

## Core architecture: GPS is the source of truth

The entire game is built around **real-world geographic coordinates**, not screen pixels.
This is a hard architectural rule, not a nice-to-have:

- Every position in the world model — the map, points of interest (currently cities,
  tiered airfields, and radar sites), and (later) aircraft — is stored as a real GPS
  coordinate (longitude/latitude, WGS84). Pixels are always
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

## Comments earn their place by explaining WHY, not narrating WHAT

A comment must add information the code cannot. Write comments that explain **why** — the
rationale for a choice, a non-obvious constraint, an invariant that must hold, a gotcha, a
subtle ordering dependency. Never write a comment that narrates *what* the code plainly
already says.

- If a comment merely paraphrases the line(s) beneath it, **delete it** — it is noise that
  rots out of sync with the code and buries the comments that matter.
- Do **not** strip the codebase's existing rationale comments. This repo deliberately
  documents the tricky bits (the latitude correction, projection edge cases, radar-sweep
  ordering); those "why" comments are valued and must stay. The rule bans redundant "what"
  comments — it does not mandate a comment-free codebase.
- When in doubt, ask: "would a competent reader learn anything from this that the code
  doesn't already tell them?" If no, cut it.

```ts
// Bad — restates the code, adds nothing:
// increment i by one
i += 1;

// Good — explains a non-obvious constraint:
// project() throws on out-of-bounds lon/lat, so clamp to the view before calling it
```

## Moving/deleting files — never pair `rm -rf` with an unverified move

When relocating files, do the destructive step **only after** the move has provably
succeeded. A real incident: a batch script ran `git mv <src> <dst>` followed by
`rm -rf <src-dir>` in a loop. The files were untracked, so every `git mv` failed silently
per-item — but the unconditional `rm -rf` still ran and deleted the sources before they
were ever copied. The only reason nothing was permanently lost is that the data happened
to be re-downloadable.

- Use plain `mv` to move files, not `git mv`, unless the source is already tracked
  (`git mv` fails on untracked paths). git will pick the rename up on the next `add`.
- Never delete a source in the same unconditional step as the move. Either move-then-verify
  (`mv src dst && test -e dst`) before any `rm`, or skip the separate delete entirely — a
  successful `mv` already removes the source.
- `rm -rf` bypasses the Trash; there is no undo. Treat it as irreversible and never run it
  on a path you have not confirmed is redundant.

## Package manager

This is a **pnpm workspace**. Use `pnpm` only — never `npm` or `yarn`. Do not create
`package-lock.json` or `yarn.lock`; the lockfile is `pnpm-lock.yaml`.

## Do not run the game yourself

Never try to launch, serve, or drive the game to verify a change — no dev server, no
headless browser, no end-to-end/screenshot run. The user runs and visually checks the
game themselves.

- Verify your work with `pnpm --filter sector-north-game typecheck` (or `build`) instead;
  that is the extent of automated checking expected here.
- Do not install or invoke browser-driving tooling (Playwright, Puppeteer, chromium, xvfb,
  etc.) for the game.
- When a change needs a visual check, hand it back to the user to run rather than running
  it — you may suggest the command (`pnpm --filter sector-north-game dev`), but do not
  execute it.

## HUD colours — white or black only

All HUD elements must be rendered in **white or black only** — no other colours.

This covers any on-screen overlay drawn on top of the map/world: text readouts, debug
panels, city/place labels, marker dots, icons, and any other UI chrome.

- Fills and strokes for HUD graphics: `0xffffff` or `0x000000` — or the phosphor green
  (`MAP.strokeColor`, `0x33ff66`); see the sanctioned exceptions below.
- HUD text `color`: `#ffffff` or `#000000`.
- Do not introduce *other* accent/status colours (reds, ambers, blues, etc.) for HUD,
  even for emphasis or state. Convey state through position, size, weight, or shape
  rather than an arbitrary hue.

**The map geography itself is NOT HUD and is exempt from this rule.** The coastline
outlines are rendered in radar phosphor green (`MAP.strokeColor`, `0x33ff66`) to match a
tactical C2 / radar display.

**Sanctioned exception — phosphor green (`MAP.strokeColor`, `0x33ff66`).** Beyond white
and black, HUD elements may also use the coastline's phosphor green so overlays read as
part of the tactical radar display. This began as the coastline colour and the animated
radar coverage sweeps and range rings (`RADAR.sweep`), and is now permitted for HUD chrome
generally. It is the *only* colour beyond white/black allowed for HUD graphics/text — do
not treat it as licence for any other hue.

**Sanctioned exception — photographic imagery.** Photographs shown inside HUD panels (the
radar-site photos in the info windows) may keep their natural colour — they are real
photos, not chrome, and the box's white frame + black letterbox keeps them contained. By
explicit user request these are *not* desaturated. This exception is only for genuine
photographs placed in an image slot; it is not licence to colour any graphic, text, icon,
or other chrome, which stay white/black (+ the phosphor green above).
