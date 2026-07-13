import { MAP } from './map'

export const CITY = {
  /**
   * City marker icon (the Lucide `building-2` glyph, the same icon the toolbar
   * uses for the cities toggle) — its edge length on screen in CSS pixels, held
   * constant across zoom.
   */
  iconScreenSize: 15,
  /**
   * On-screen edge length (CSS px) of each city's invisible click target that
   * opens its detail window. A touch larger than the icon so the small glyph is
   * comfortable to hit; held constant on screen (re-derived per zoom via
   * `screenPxToWorld`) like the icon itself. Mirrors `RADAR.hitTargetScreenSize`.
   */
  hitTargetScreenSize: 26,
  labelColor: '#ffffff',
  /** Label font weight (CSS numeric weight). */
  labelFontWeight: '600',
  /** Label font size on screen (CSS pixels). */
  labelScreenSize: 13,
  /** Clear gap between the top of the icon and the bottom of the label (CSS pixels). */
  labelScreenGap: 4,
  /**
   * Zoom at/above which the city name labels appear. Below it only the icons
   * show, so the far-out country view isn't crowded with names. Sits inside the
   * reachable range (`ZOOM.min`..`ZOOM.max` = 6.5..60).
   */
  labelRevealZoom: 10,
} as const

export const AIRPORT = {
  /**
   * Triangle circumradius on screen (CSS pixels), per tier — the large fields
   * (major airports, military airbases) get a bigger glyph than the minor
   * grass strips/glider fields so relative importance reads from size alone.
   */
  markerScreenRadius: { military: 5, major: 5, minor: 3 },
  /** Marker outline width on screen (CSS pixels). */
  strokeScreenWidth: 1.25,
  /** Marker colour — outline for civil fields, fill for military (HUD: white). */
  color: 0xffffff,
  labelColor: '#ffffff',
  /** Label font size on screen (CSS pixels). */
  labelScreenSize: 11,
  /** Clear gap between the marker and the bottom of the label (CSS pixels). */
  labelScreenGap: 3,
  /**
   * Zoom at/above which the prominent airfields (major airports + military
   * airbases) show their name labels. Sits well above `ZOOM.min` (6.5) so the
   * map opens — and stays, through the mid-range — with triangles but no names;
   * the names appear only once the player has zoomed in close on a region.
   */
  labelRevealZoom: 14,
  /**
   * Zoom at/above which the minor airfields (grass strips, glider/flying clubs)
   * show their names. Their triangles are always drawn (like every field); only
   * the dense minor *names* stay hidden until the player is zoomed right in.
   * Higher than `labelRevealZoom` and inside the reachable range
   * (`ZOOM.min`..`ZOOM.max` = 6.5..60), so the minor names only label up once
   * the player is zoomed in close.
   */
  minorLabelRevealZoom: 32,
} as const

export const RADAR = {
  /** Circle radius on screen (CSS pixels), held constant across zoom. */
  markerScreenRadius: 4,
  /**
   * On-screen edge length (CSS px) of each site's invisible click target. Larger
   * than the drawn marker so the small circle is comfortable to hit; held constant
   * on screen (re-derived per zoom via `screenPxToWorld`) like the marker itself.
   */
  hitTargetScreenSize: 24,
  /** Circle outline width on screen (CSS pixels). */
  strokeScreenWidth: 1.25,
  /** Marker colour — the circle outline (HUD: white). */
  color: 0xffffff,
  labelColor: '#ffffff',
  /** Label font size on screen (CSS pixels) — site name and model, stacked. */
  labelScreenSize: 11,
  /** Clear gap between the circle and the bottom of the label (CSS pixels). */
  labelScreenGap: 3,
  /**
   * Zoom at/above which the radar labels (site name + model) appear. Below it only
   * the range rings show. Set a little below the airport reveal (14) — the sites
   * are sparse, so naming them earlier doesn't clutter — while staying inside the
   * reachable range (`ZOOM.min`..`ZOOM.max` = 6.5..60).
   */
  labelRevealZoom: 11,
  /**
   * The animated coverage sweep (see the "Every-frame / animated" reaction-pattern note
   * in `apps/game/CLAUDE.md`): its geometry is a real-world distance (km × `pixelsPerKm`),
   * so it lives in world space and zooms with the map — only the stroke widths below are
   * constant on screen.
   *
   * Drawn in phosphor green (`MAP.strokeColor`), not white — a deliberate,
   * user-requested exception to the HUD white/black rule so the sweep reads as part of
   * the tactical radar picture alongside the borders. See the HUD colour rule in the
   * root `CLAUDE.md`.
   */
  sweep: {
    /** Sweep-hand line width on screen (CSS pixels), held constant across zoom. */
    lineScreenWidth: 1.25,
    /** Range-ring line width on screen (CSS pixels). */
    ringScreenWidth: 1,
    /** Sweep + ring colour — phosphor green, matching the coastline (see above). */
    color: MAP.strokeColor,
    lineAlpha: 0.7,
    /** Range-ring opacity — faint, so it reads as a background extent marker. */
    ringAlpha: 0.12,
  },
} as const

/**
 * Simulated air traffic. Aircraft fly in the background at all times (their
 * real lon/lat is the source of truth — see `src/map/aircraft.ts`); the player
 * only ever sees a **contact** painted where a radar sweep last passed over one.
 * There is no fade: a contact stays put at full brightness until the hand comes
 * back around to its bearing, which either repaints it at the plane's new
 * position (still there) or clears it (moved on / gone). So a contact jumps
 * forward one step per revolution and holds its last-seen spot in between.
 *
 * Contacts are drawn in white (the HUD default), distinct from the phosphor-green
 * coverage sweep that reveals them.
 */
export const PLANE = {
  /**
   * Contact icon: a diamond pointing along the plane's heading. Half-extents on
   * screen (CSS pixels), held constant across zoom — the along-heading half is
   * longer than the across half so the diamond clearly points which way the
   * plane is flying.
   */
  iconHalfLengthScreen: 9,
  iconHalfWidthScreen: 5,
  /**
   * Zoom at/above which the contact icon holds a constant on-screen size (fixed
   * when zoomed in). Below it the icon is world-anchored, so it scales on screen
   * with the terrain as you zoom out. Implemented by clamping the zoom fed to
   * `screenPxToWorld` to at least this value — continuous at the threshold. Sits
   * inside the reachable range (`ZOOM.min`..`ZOOM.max` = 6.5..60).
   */
  sizeLockZoom: 30,
  /**
   * Velocity vector drawn from each blip in the plane's heading, its on-screen
   * length proportional to speed at this many CSS pixels per km/h (so 800 km/h ≈
   * 24 px). Held constant on screen like the circle, not scaled with the world.
   */
  vectorScreenPxPerKmh: 0.03,
  /** Velocity-vector line width on screen (CSS pixels). */
  vectorLineScreenWidth: 1.25,
  /** Contact colour — white (HUD default). */
  blipColor: 0xffffff,
  /** Contact opacity — constant (no fade); a contact is either shown or cleared. */
  blipAlpha: 0.9,
  /** How many aircraft `/spawn-planes` creates when no count is given. */
  defaultSpawnCount: 8,
} as const

/**
 * The debug waypoint-route overlay (`WaypointLayer`), toggled from the
 * localhost-only dev toolbar: each brained aircraft's planned route drawn as a
 * polyline with a hollow circle per waypoint. Phosphor green (`MAP.strokeColor`)
 * so it reads as radar-display chrome, not a tactical contact (contacts are
 * white). All sizes are held constant on screen at every zoom, like the
 * coastline hairline.
 */
export const WAYPOINT = {
  /** Waypoint circle radius on screen (CSS pixels). */
  circleRadiusScreen: 3.5,
  /** Route polyline / circle stroke width on screen (CSS pixels). */
  lineScreenWidth: 1,
  color: MAP.strokeColor,
  /** Dimmer than the coverage sweep hand — an annotation, not a signal. */
  alpha: 0.55,
} as const
