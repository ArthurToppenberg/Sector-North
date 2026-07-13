// Deliberately a twin of src/map/validate.ts's makeFail rather than a shared
// import: src/map/ must stay a pure world layer with no game/ coupling, and a
// third shared root isn't worth a 3-line factory.

export type Fail = (message: string) => never

export function makeFail(moduleTag: string): Fail {
  return (message) => {
    throw new Error(`[${moduleTag}] ${message}`)
  }
}
