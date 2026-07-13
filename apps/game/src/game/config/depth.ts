// Explicit draw order (higher renders on top).
export const DEPTH = {
  grid: 0,
  coastline: 10,
  // Radar coverage sweeps sit just above the coastline but beneath every marker
  // layer: the large, faint rings and rotating hands wash behind the city/airport/
  // radar glyphs so those stay legible on top.
  radarSweep: 15,
  // Radar contact blips sit just above the coverage sweep that paints them, but
  // beneath the marker glyphs so the (sparse) infrastructure icons stay legible.
  planeBlips: 16,
  // Debug waypoint routes overlay the blips they explain, but stay beneath the
  // marker glyphs like the rest of the air picture.
  waypointRoutes: 17,
  cityDots: 20,
  cityLabels: 30,
  // Airports sit just above the city labels so their markers/labels aren't
  // hidden under a nearby city's name.
  airportMarkers: 40,
  airportLabels: 50,
  // Radar sites sit above the airfields: the circles and their name/model labels
  // are sparse infrastructure that should read on top of the denser airport
  // markers below them.
  radarMarkers: 60,
  radarLabels: 70,
  hud: 100,
  // Interactive chrome sits above the read-only telemetry HUD; the icon draws
  // one step above its own button surface.
  toolbarButton: 110,
  toolbarIcon: 111,
  // The developer console: a fixed bottom-left HUD panel that sits above the
  // toolbar but below the detail windows, so a dragged window can be raised over
  // it. Panel surface first, its text/controls one step above.
  consolePanel: 115,
  consoleContent: 116,
  // The site detail window (opened by clicking a marker) overlays everything,
  // including the toolbar: its panel surface first, then its text and controls
  // one step above so they read on top of the panel.
  window: 120,
  windowContent: 121,
  // The `/subwoofer` easter-egg image overlays the entire scene, above every
  // panel and window, for the brief moment it plays.
  subwoofer: 200,
} as const
