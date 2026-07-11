import { defineConfig } from 'vitest/config'

// Standalone on purpose: vite.config.ts carries build-only plugins (bundle-size
// report, JSON minification) that have no business running under the test runner.
// Being a Vite config, this still resolves the `?url` asset imports in src/map/.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
