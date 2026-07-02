/// <reference types="vite/client" />

// Raw text imports (Vite's `?raw` suffix). Used to inline the GeoJSON source at
// build time and parse it ourselves.
declare module '*?raw' {
  const content: string
  export default content
}
