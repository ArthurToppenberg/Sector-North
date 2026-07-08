/**
 * Lucide icons are authored with `stroke`/`fill` set to `currentColor`, but a
 * standalone SVG rasterised into a Phaser texture has no CSS colour context to
 * inherit — it would fall back to black and vanish on the black map. Bake the
 * HUD white (project rule: HUD is white or black only) straight into the markup
 * and hand Phaser a self-contained data URI.
 */
export function iconDataUri(raw: string): string {
  const white = raw.replaceAll('currentColor', '#ffffff')
  // Phaser's SVG loader `atob`s the data-URI payload, so it must be base64 (a
  // percent-encoded URI makes `atob` throw and the loader stalls, never firing
  // `create`). Lucide markup is pure ASCII, so `btoa` handles it directly.
  return `data:image/svg+xml;base64,${btoa(white)}`
}
