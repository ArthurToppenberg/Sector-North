import { defineConfig, type Plugin } from 'vite'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

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
  return {
    name: 'minify-json-assets',
    apply: 'build',
    configResolved(config) {
      // outDir is relative to root; resolve to an absolute path to walk.
      outDir = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
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
        }
      }
      await processDir(outDir)
    },
  }
}

export default defineConfig({
  // Set by the GitHub Pages workflow (e.g. "/Sector-North/"); defaults to "/" locally.
  base: process.env.BASE_PATH ?? '/',
  plugins: [minifyJsonAssets()],
  server: {
    open: true,
  },
})
