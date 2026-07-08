const CURRENT_COLOR = 'currentColor'
const HUD_WHITE = '#ffffff'
const NON_ASCII = /[^\x00-\x7f]/

function assertSvgMarkup(raw: string): void {
  if (raw.trim() === '') {
    throw new Error('iconDataUri received empty SVG markup')
  }
  if (!raw.includes('<svg')) {
    throw new Error('iconDataUri received markup that is not an SVG')
  }
}

// btoa silently mis-encodes bytes 128–255 (only >255 throws), so reject non-ASCII up front.
function assertAscii(svg: string): void {
  if (NON_ASCII.test(svg)) {
    throw new Error(
      'SVG icon markup contains non-ASCII characters; base64 encoding would ' +
        'corrupt or throw. Author HUD icons in pure ASCII.',
    )
  }
}

function bakeHudWhite(svg: string): string {
  if (!svg.includes(CURRENT_COLOR)) {
    throw new Error(
      `SVG icon markup has no "${CURRENT_COLOR}" to bake HUD white into; ` +
        'it would rasterise black and vanish on the map',
    )
  }
  return svg.replaceAll(CURRENT_COLOR, HUD_WHITE)
}

function toBase64DataUri(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

// Raw Lucide SVG markup -> Phaser-loadable, HUD-white base64 data URI.
export function iconDataUri(raw: string): string {
  assertSvgMarkup(raw)
  const white = bakeHudWhite(raw)
  assertAscii(white)
  return toBase64DataUri(white)
}
