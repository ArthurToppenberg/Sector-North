import { defineConfig, type Plugin, type Logger } from 'vite'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { gzipSync } from 'node:zlib'

/** Human-readable byte size, e.g. `2671716` → `"2.55 MB"`. */
function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/**
 * Group an emitted file into a human-readable category by extension, so the
 * bundle report can be read by type (geo data vs. engine vs. imagery, …) rather
 * than as one flat list. Anything unrecognised lands in `Other` — a visible
 * bucket, not a silent drop, so a newly-added asset kind shows up and gets a
 * proper category here.
 */
function categoryOf(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'JavaScript'
    case 'css':
      return 'CSS'
    case 'html':
      return 'HTML'
    case 'json':
      return 'Geo data'
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'webp':
    case 'avif':
    case 'gif':
    case 'svg':
      return 'Images'
    case 'woff':
    case 'woff2':
    case 'ttf':
    case 'otf':
    case 'eot':
      return 'Fonts'
    default:
      return 'Other'
  }
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

/**
 * One table column: its header, body alignment, and an optional colour applied
 * to body cells (headers are always dim, the total row always bold).
 */
interface Column {
  header: string
  align: Align
  colour?: (s: string) => string
}

/**
 * One block of rows in a table: the body rows, plus an optional emphasised
 * `subtotal` row drawn (bold) at the group's foot. A table with a single
 * subtotal-less group renders exactly like a plain flat table — so callers that
 * don't group (the JSON minification report) pass `[{ rows }]` unchanged.
 */
interface RowGroup {
  rows: string[][]
  subtotal?: string[]
}

/**
 * Render a titled, bordered table shared by every build-time report so they all
 * look identical. `groups`/`total` are pre-formatted string cells, one per
 * column; consecutive groups are separated by a horizontal rule, and any group
 * `subtotal` and the final `total` are rendered bold. Returns the block as a
 * single multi-line string ready for `logger.info`.
 */
function renderTable(title: string, columns: Column[], groups: RowGroup[], total: string[]): string {
  const c = makeColors()
  const dash = (n: number) => '─'.repeat(n)
  const aligns = columns.map((col) => col.align)

  const allRows = [...groups.flatMap((g) => (g.subtotal ? [...g.rows, g.subtotal] : g.rows)), total]
  const widths = columns.map((col, i) =>
    Math.max(col.header.length, ...allRows.map((row) => row[i].length)),
  )

  const border = (l: string, mid: string, r: string) =>
    c.dim(l + widths.map((w) => dash(w + 2)).join(mid) + r)
  const line = (cells: string[], colourOf: (i: number) => (s: string) => string) =>
    c.dim('│ ') + cells.map((t, i) => cell(t, widths[i], aligns[i], colourOf(i))).join(c.dim(' │ ')) + c.dim(' │')

  const out: string[] = []
  out.push('')
  out.push(c.bold(c.cyan(`  ✦ ${title}`)))
  out.push('  ' + border('┌', '┬', '┐'))
  out.push('  ' + line(columns.map((col) => col.header), () => c.dim))
  for (const group of groups) {
    out.push('  ' + border('├', '┼', '┤'))
    for (const row of group.rows) {
      out.push('  ' + line(row, (i) => columns[i].colour ?? ((s) => s)))
    }
    if (group.subtotal) out.push('  ' + line(group.subtotal, () => c.bold))
  }
  out.push('  ' + border('├', '┼', '┤'))
  out.push('  ' + line(total, () => c.bold))
  out.push('  ' + border('└', '┴', '┘'))
  return out.join('\n')
}

interface MinifyResult {
  name: string
  before: number
  after: number
  /** Gzipped size of the minified output — what GitHub Pages actually serves. */
  gzip: number
}

function renderReport(results: MinifyResult[]): string {
  const c = makeColors()
  const pct = (before: number, after: number) =>
    `${(before === 0 ? 0 : (1 - after / before) * 100).toFixed(1)}%`

  const columns: Column[] = [
    { header: 'file', align: 'l' },
    { header: 'original', align: 'r', colour: c.dim },
    { header: 'reduced', align: 'r' },
    { header: 'saved', align: 'r', colour: c.green },
    { header: 'new', align: 'r' },
    { header: 'gzip', align: 'r', colour: c.dim },
  ]
  const row = (name: string, before: number, after: number, gzip: number) => [
    name,
    formatBytes(before),
    formatBytes(before - after),
    pct(before, after),
    formatBytes(after),
    formatBytes(gzip),
  ]

  const rows = results.map((r) => row(r.name, r.before, r.after, r.gzip))
  const totalBefore = results.reduce((sum, r) => sum + r.before, 0)
  const totalAfter = results.reduce((sum, r) => sum + r.after, 0)
  const totalGzip = results.reduce((sum, r) => sum + r.gzip, 0)
  return renderTable('JSON minification', columns, [{ rows }], row('total', totalBefore, totalAfter, totalGzip))
}

/**
 * Replace Vite's native bundle-size report with one in the same MB table style
 * as the JSON minification report above.
 *
 * Vite has no config knob for the size unit — its reporter always prints `kB`,
 * one line per emitted file. So this does two things: it wraps `logger.info` to
 * suppress those native `… kB …` lines, then renders its own table from the
 * bundle in `writeBundle`, measuring each file's raw size and its gzip size
 * (GitHub Pages serves these gzipped, so the gzip column is the number that
 * actually ships). Sizes are the as-emitted bytes, before the JSON minification
 * pass in `closeBundle` — the same point Vite measures — so the two tables tell
 * a consistent before/after story.
 */
function reportBundleSizes(): Plugin {
  let outDirName = 'dist'
  let logger: Logger
  return {
    name: 'report-bundle-sizes',
    apply: 'build',
    configResolved(config) {
      outDirName = config.build.outDir
      logger = config.logger
      const info = logger.info.bind(logger)
      // Drop Vite's own `… kB …` size lines wherever they appear (batched or
      // per-line); our table below reports the same files. A message that was
      // entirely such lines is swallowed rather than logged as blank.
      logger.info = (msg, opts) => {
        const kept = msg
          .split('\n')
          .filter((line) => !/\d[\d.,]*\s*kB\b/.test(line))
          .join('\n')
        if (kept.trim() === '' && msg.trim() !== '') return
        info(kept, opts)
      }
    },
    writeBundle(_options, bundle) {
      const files = Object.entries(bundle).map(([fileName, output]) => {
        const raw = output.type === 'chunk' ? output.code : output.source
        const content = typeof raw === 'string' ? Buffer.from(raw) : Buffer.from(raw)
        return { name: `${outDirName}/${fileName}`, size: content.byteLength, gzip: gzipSync(content).length }
      })
      if (files.length === 0) return

      const c = makeColors()
      const columns: Column[] = [
        { header: 'category', align: 'l', colour: c.cyan },
        { header: 'file', align: 'l' },
        { header: 'size', align: 'r' },
        { header: 'gzip', align: 'r', colour: c.dim },
      ]

      // Bucket every file by category, then order both the categories and the
      // files within each by size (largest first) so the heaviest groups —
      // where any size win lives — read top-down.
      const byCategory = new Map<string, typeof files>()
      for (const f of files) {
        const list = byCategory.get(categoryOf(f.name)) ?? []
        list.push(f)
        byCategory.set(categoryOf(f.name), list)
      }
      const sum = (list: typeof files, key: 'size' | 'gzip') =>
        list.reduce((acc, f) => acc + f[key], 0)

      const groups: RowGroup[] = [...byCategory.entries()]
        .map(([category, list]) => ({
          category,
          list: [...list].sort((a, b) => b.size - a.size),
          size: sum(list, 'size'),
          gzip: sum(list, 'gzip'),
        }))
        .sort((a, b) => b.size - a.size)
        .map(({ category, list, size, gzip }) => ({
          // Category label sits on the group's first row only; its foot carries
          // the bold per-category subtotal (with the file count).
          rows: list.map((f, i) => [
            i === 0 ? category : '',
            f.name,
            formatBytes(f.size),
            formatBytes(f.gzip),
          ]),
          subtotal: [
            '',
            `subtotal (${list.length} ${list.length === 1 ? 'file' : 'files'})`,
            formatBytes(size),
            formatBytes(gzip),
          ],
        }))

      const totalSize = sum(files, 'size')
      const totalGzip = sum(files, 'gzip')
      logger.info(
        renderTable('bundle output', columns, groups, [
          'total',
          '',
          formatBytes(totalSize),
          formatBytes(totalGzip),
        ]),
      )
    },
  }
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
            gzip: gzipSync(Buffer.from(minified)).length,
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
  plugins: [reportBundleSizes(), minifyJsonAssets()],
  build: {
    // We render our own bundle-size table (see reportBundleSizes), computing gzip
    // ourselves, so Vite's own compressed-size pass would be duplicated work.
    reportCompressedSize: false,
    // Every `?url` JSON dataset (country boundaries + cities/airports/radars) must
    // ship as its own file in `dist/`, fetched at runtime — never inlined as a
    // base64 data URI. The small datasets (major-cities ~0.6 KB, radars ~2.6 KB)
    // fall under Vite's default 4 KB inline threshold, so force JSON to emit as a
    // file regardless of size; other asset kinds keep the default behaviour.
    assetsInlineLimit: (filePath) => (filePath.endsWith('.json') ? false : undefined),
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
