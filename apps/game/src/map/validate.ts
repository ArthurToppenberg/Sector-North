// Shared strict-validation vocabulary for the src/map/ data loaders. Every
// helper takes the caller's `fail` so error messages keep their per-module
// `[map/<x>]` tag, and the caller composes the subject text (e.g. `city Odense`).
// Must stay Phaser- and config-free: src/map/ is the pure world layer.

export type Fail = (message: string) => never

export function makeFail(moduleTag: string): Fail {
  return (message) => {
    throw new Error(`[${moduleTag}] ${message}`)
  }
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function requireNonEmptyString(value: unknown, fail: Fail, subject: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${subject} is missing or empty`)
  return value
}

// The WGS84 coordinate bounds, centralized here once — loaders must never
// restate them.
const LON_MIN = -180
const LON_MAX = 180
const LAT_MIN = -90
const LAT_MAX = 90

export function requireLon(value: unknown, fail: Fail, subject: string): number {
  if (!isFiniteNumber(value) || value < LON_MIN || value > LON_MAX) {
    fail(`${subject} has out-of-range longitude: ${JSON.stringify(value)}`)
  }
  return value
}

export function requireLat(value: unknown, fail: Fail, subject: string): number {
  if (!isFiniteNumber(value) || value < LAT_MIN || value > LAT_MAX) {
    fail(`${subject} has out-of-range latitude: ${JSON.stringify(value)}`)
  }
  return value
}

export function requirePositiveNumber(value: unknown, fail: Fail, subject: string): number {
  if (!isFiniteNumber(value) || value <= 0) {
    fail(`${subject} is non-positive: ${JSON.stringify(value)}`)
  }
  return value
}

/** Null is a valid, explicit "not applicable"; any present value must be positive. */
export function requireNullablePositiveNumber(
  value: unknown,
  fail: Fail,
  subject: string,
): number | null {
  if (value === null) return null
  return requirePositiveNumber(value, fail, subject)
}

export function requireOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fail: Fail,
  subject: string,
): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    fail(`${subject} is invalid (want ${allowed.join('/')}): ${JSON.stringify(value)}`)
  }
  return value as T
}

export function requireNonEmptyArray(value: unknown, fail: Fail, subject: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`expected a non-empty array of ${subject}`)
  }
  return value
}

/** A bundled dataset's Phaser JSON-cache key and its Vite `?url` asset URL. */
export interface Asset {
  readonly cacheKey: string
  readonly url: string
}
