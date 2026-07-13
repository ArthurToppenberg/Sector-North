// ── Camera & input ─────────────────────────────────────────────────────────
// Zoom limits, keyboard pan speed, and the geographic play-area bounds. The
// zoom limits and centre bounds are LOCKED game settings — see the "Camera
// bounds are locked" rule in `apps/game/CLAUDE.md`.

/**
 * Camera zoom limits and wheel response.
 * `step` is the zoom factor applied by one full wheel notch; `deltaPerStep` is the
 * `deltaY` magnitude that counts as one notch. Scaling the factor by the actual delta
 * (rather than a fixed step per event) keeps a trackpad — which fires a rapid stream of
 * small-delta events — from compounding into runaway zoom.
 */
export const ZOOM = { min: 6.5, max: 60, step: 1.12, deltaPerStep: 100 } as const

/**
 * Max pointer travel (CSS pixels, press → release) still treated as a click
 * rather than a drag. A click on a site marker opens its detail window; drag past
 * this and it's a camera pan, which must not open the window. Kept small so a
 * deliberate tap opens the window but the tail end of a pan never does.
 */
export const CLICK_MAX_TRAVEL_SCREEN = 6

/**
 * Keyboard pan speed as CSS pixels/second on screen (held constant across zoom
 * by dividing the world step by the current zoom).
 */
export const KEY_PAN_SPEED = 700

/**
 * The play area: fixed limits for where the camera CENTRE (the world point it
 * looks at) may roam, as a geographic lon/lat box (WGS84). Sized to the full
 * radar-coverage footprint so the player can pan out over all the watched
 * airspace; `MainScene` projects these four corners via `project()` at load
 * (GPS is the source of truth — never pixel bounds).
 *
 * LOCKED — widened from the original Denmark-only box at the user's explicit
 * request (2026-07-08) to reveal the radar coverage. Do not change these values
 * (or the ZOOM min/max above) without a fresh explicit request. See the "Camera
 * bounds are locked" rule in `apps/game/CLAUDE.md`.
 */
export const CAMERA_CENTER_BOUNDS = {
  /** Longitude (°E) extents — out to the west/east edges of the radar coverage. */
  west: 2,
  east: 23,
  /** Latitude (°N) extents — from below Bornholm's reach up past Skagen's. */
  south: 50,
  north: 62,
} as const

/**
 * The lon/lat the map is framed on at startup (central Denmark), kept separate
 * from `CAMERA_CENTER_BOUNDS` so the roam box and the opening view stay
 * independent (widening the box doesn't move where the map opens). WGS84. See
 * `apps/game/CLAUDE.md`.
 */
export const CAMERA_INITIAL_CENTER = {
  lon: 10.75,
  lat: 56,
} as const
