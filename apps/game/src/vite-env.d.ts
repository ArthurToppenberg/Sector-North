/// <reference types="vite/client" />

// Raw text imports (Vite's `?raw` suffix). Used to inline data at build time and
// parse it ourselves: the city/airport JSON and the Lucide SVG icon markup.
// (Country boundaries instead use `?url` — emitted to `dist/` and fetched at runtime.)
declare module '*?raw' {
  const content: string
  export default content
}
