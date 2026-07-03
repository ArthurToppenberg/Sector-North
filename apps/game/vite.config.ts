import { defineConfig } from 'vite'

export default defineConfig({
  // Set by the GitHub Pages workflow (e.g. "/Sector-North/"); defaults to "/" locally.
  base: process.env.BASE_PATH ?? '/',
  server: {
    open: true,
  },
})
