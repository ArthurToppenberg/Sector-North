# Project rules for Claude

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
