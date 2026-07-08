// Turns raw Lucide SVG markup into a HUD-white, base64 data-URI texture for Phaser.

const CURRENT_COLOR = 'currentColor'
const HUD_WHITE = '#ffffff'

/**
 * Bake the HUD white into the markup, replacing every `currentColor`. Markup
 * without a `currentColor` to replace would rasterise black and vanish on the
 * map, so that is a bug in the source asset — throw rather than emit an
 * invisible icon.
 */
function bakeHudWhite(svg: string): string {
  if (!svg.includes(CURRENT_COLOR)) {
    throw new Error(
      `SVG icon markup has no "${CURRENT_COLOR}" to bake HUD white into; ` +
        'it would rasterise black and vanish on the map',
    )
  }
  return svg.replaceAll(CURRENT_COLOR, HUD_WHITE)
}

/**
 * Encode self-contained SVG markup as a base64 data URI. Phaser's SVG loader
 * `atob`s the data-URI payload, so it must be base64 (a percent-encoded URI
 * makes `atob` throw and the loader stalls, never firing `create`). Lucide
 * markup is pure ASCII, so `btoa` handles it directly — any non-Latin1 markup
 * makes `btoa` throw, which is the correct fail-fast signal.
 */
function toBase64DataUri(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

/**
 * Turn raw Lucide SVG markup into a Phaser-loadable, HUD-white data URI.
 * Throws on anything that is not usable SVG markup.
 */
export function iconDataUri(raw: string): string {
  if (raw.trim() === '') {
    throw new Error('iconDataUri received empty SVG markup')
  }
  if (!raw.includes('<svg')) {
    throw new Error('iconDataUri received markup that is not an SVG')
  }
  return toBase64DataUri(bakeHudWhite(raw))
}
