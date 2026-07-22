/**
 * Device pixel ratio, floored at 1. The canvas backing store is sized at
 * `cssPixels * DPR` and scaled back down via Phaser's `zoom` config, so all
 * in-game coordinates are in device pixels.
 *
 * The `|| 1` is NOT a fallback masking a missing value (which the project rules
 * forbid): `window.devicePixelRatio` is `0`/`undefined` only in environments
 * with no display density concept, where a ratio of exactly 1 is the correct
 * answer, not a guess. The outer `Math.max(..., 1)` additionally rejects a
 * pathological sub-1 ratio.
 *
 * This module holds the config tree's only `window` reads, evaluated at module
 * load — deliberately isolated here so a non-DOM context (tests) only has to
 * stub for this one module.
 */
export const DPR = Math.max(window.devicePixelRatio || 1, 1)

/**
 * Whether the game is being served from a local dev machine. Gates
 * developer-only chrome (the dev toolbar) that must never appear on the
 * deployed site.
 */
export const IS_LOCALHOST = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)

/** Shared HUD typeface — Chakra Petch, a squared techno face for the tactical look. */
export const FONT_FAMILY = 'Chakra Petch' as const

/**
 * Game-level event the scene emits once `create` has finished — i.e. the world
 * is projected and every preloaded asset (the toolbar + city SVG glyphs, the radar
 * site photos, and the boundary/cities/airports/radars JSON) has loaded. `main.ts`
 * listens for it to tear down the boot loader. Shared here so the emit and the
 * listen can't drift apart.
 */
export const APP_READY_EVENT = 'app-ready' as const

/**
 * Game-level events `MainScene.preload` mirrors from Phaser's loader so the DOM
 * boot overlay (`main.ts`) can render a progress bar and the key of each loaded
 * file without reaching into Phaser's loader plugin. BOOT_LOAD_PROGRESS_EVENT
 * carries the overall 0..1 completion; BOOT_LOAD_FILE_EVENT carries the key of
 * the file that just finished. Shared here, like APP_READY_EVENT, so the emit
 * and the listen can't drift apart.
 */
export const BOOT_LOAD_PROGRESS_EVENT = 'boot-load-progress' as const
export const BOOT_LOAD_FILE_EVENT = 'boot-load-file' as const
