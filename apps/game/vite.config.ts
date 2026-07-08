import { defineConfig, type Plugin, type Logger } from 'vite'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

/** Human-readable byte size, e.g. `2671716` → `"2609.1 kB"`. */
function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} kB`
}

/**
 * ANSI colour helpers, disabled when stdout is not a TTY or `NO_COLOR` is set
 * (so CI logs stay plain). Each wraps a string in a colour and resets after.
 */
function makeColors() {
  const on = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR
  const wrap = (code: string) => (s: string) => (on ? `\x1b[${code}m${s}\x1b[0m` : s)
  return {
    bold: wrap('1'),
    dim: wrap('2'),
    green: wrap('32'),
    cyan: wrap('36'),
  }
}

type Align = 'l' | 'r'

/** Pad plain text to `width`, then apply the colour (so codes never skew width). */
function cell(text: string, width: number, align: Align, colour: (s: string) => string): string {
  const padded = align === 'r' ? text.padStart(width) : text.padEnd(width)
  return colour(padded)
}

/** One boundary asset's before/after minification measurement. */
interface MinifyResult {
  name: string
  before: number
  after: number
}

/**
 * Render the per-file + total measurements as a bordered, right-aligned table.
 * Returns the block as a single multi-line string ready for `logger.info`.
 */
function renderReport(results: MinifyResult[]): string {
  const c = makeColors()
  const dash = (n: number) => '─'.repeat(n)
  const pct = (before: number, after: number) =>
    `${(before === 0 ? 0 : (1 - after / before) * 100).toFixed(1)}%`

  const headers = ['file', 'before', 'after', 'saved']
  const aligns: Align[] = ['l', 'r', 'r', 'r']
  const rows = results.map((r) => [r.name, formatBytes(r.before), formatBytes(r.after), pct(r.before, r.after)])

  const totalBefore = results.reduce((sum, r) => sum + r.before, 0)
  const totalAfter = results.reduce((sum, r) => sum + r.after, 0)
  const totalRow = ['total', formatBytes(totalBefore), formatBytes(totalAfter), pct(totalBefore, totalAfter)]

  // Column widths: widest of header, every row, and the total row.
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i].length), totalRow[i].length),
  )

  const border = (l: string, mid: string, r: string) =>
    c.dim(l + widths.map((w) => dash(w + 2)).join(mid) + r)
  const line = (cells: string[], colour: (s: string) => string) =>
    c.dim('│ ') + cells.map((t, i) => cell(t, widths[i], aligns[i], colour)).join(c.dim(' │ ')) + c.dim(' │')

  const savedColour = (before: number, after: number) => (after < before ? c.green : c.dim)

  const out: string[] = []
  out.push('')
  out.push(c.bold(c.cyan('  ✦ JSON minification')))
  out.push('  ' + border('┌', '┬', '┐'))
  out.push('  ' + line(headers, c.dim))
  out.push('  ' + border('├', '┼', '┤'))
  for (const r of results) {
    const cells = [r.name, formatBytes(r.before), formatBytes(r.after), pct(r.before, r.after)]
    const coloured = [
      cell(cells[0], widths[0], aligns[0], (s) => s),
      cell(cells[1], widths[1], aligns[1], c.dim),
      cell(cells[2], widths[2], aligns[2], (s) => s),
      cell(cells[3], widths[3], aligns[3], savedColour(r.before, r.after)),
    ]
    out.push('  ' + c.dim('│ ') + coloured.join(c.dim(' │ ')) + c.dim(' │'))
  }
  out.push('  ' + border('├', '┼', '┤'))
  out.push('  ' + line(totalRow, c.bold))
  out.push('  ' + border('└', '┴', '┘'))
  return out.join('\n')
}

/**
 * Strip whitespace from every JSON asset in the build output.
 *
 * The country boundaries ship as `?url` assets (see src/map/geojson.ts), so
 * Vite copies them into `dist/` verbatim — pretty-printing and all. GitHub
 * Pages cannot serve pre-compressed `.gz`/`.br` files but does apply on-the-fly
 * gzip to `application/json`, so the one useful build-time win is removing that
 * whitespace before gzip runs. This rewrites only the built copies; the source
 * files under `src/data/` stay human-readable.
 *
 * Per the repo CLAUDE.md ("fail fast — no fallbacks"), a file that will not
 * parse aborts the build with its path rather than being copied through
 * unminified.
 */
function minifyJsonAssets(): Plugin {
  let outDir = ''
  let logger: Logger
  return {
    name: 'minify-json-assets',
    apply: 'build',
    configResolved(config) {
      // outDir is relative to root; resolve to an absolute path to walk.
      outDir = resolve(config.root, config.build.outDir)
      logger = config.logger
    },
    async closeBundle() {
      const results: MinifyResult[] = []

      async function processDir(dir: string): Promise<void> {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          const fullPath = join(dir, entry.name)
          if (entry.isDirectory()) {
            await processDir(fullPath)
            continue
          }
          if (!fullPath.endsWith('.json')) continue

          const content = await readFile(fullPath, 'utf-8')
          let minified: string
          try {
            minified = JSON.stringify(JSON.parse(content))
          } catch (e) {
            throw new Error(
              `[minify-json-assets] ${fullPath} is not valid JSON: ${(e as Error).message}`,
            )
          }
          await writeFile(fullPath, minified)

          results.push({
            // Drop Vite's `-<hash>` suffix for a readable display name.
            name: entry.name.replace(/-[^-.]+\.json$/, '.json'),
            before: Buffer.byteLength(content),
            after: Buffer.byteLength(minified),
          })
        }
      }

      await processDir(outDir)
      if (results.length > 0) logger.info(renderReport(results))
    },
  }
}

export default defineConfig({
  // Set by the GitHub Pages workflow (e.g. "/Sector-North/"); defaults to "/" locally.
  base: process.env.BASE_PATH ?? '/',
  plugins: [minifyJsonAssets()],
  build: {
    // Split Phaser into its own long-lived vendor chunk. Phaser (~1.4 MB) never
    // changes between deploys while the game code changes constantly; keeping them
    // separate means a game update only busts the small app chunk's hash, so
    // returning players keep Phaser cached instead of re-downloading it every ship.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'phaser', test: /[\\/]node_modules[\\/]phaser[\\/]/ }],
        },
      },
    },
    // The Phaser vendor chunk is legitimately >500 kB by design (see above), so the
    // default warning would fire on every build. Raise it above Phaser's size to
    // keep the build output clean; it is not masking an accidentally-bloated bundle.
    chunkSizeWarningLimit: 1600,
  },
  server: {
    open: true,
  },
})
