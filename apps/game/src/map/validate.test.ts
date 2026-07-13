import { describe, it, expect } from 'vitest'
import {
  makeFail,
  isFiniteNumber,
  requireNonEmptyString,
  requireLon,
  requireLat,
  requirePositiveNumber,
  requireNullablePositiveNumber,
  requireOneOf,
  requireNonEmptyArray,
} from './validate'

const fail = makeFail('map/test')

describe('makeFail', () => {
  it('prefixes the module tag and always throws', () => {
    expect(() => fail('boom')).toThrow('[map/test] boom')
  })
})

describe('isFiniteNumber', () => {
  it('accepts only finite numbers', () => {
    expect(isFiniteNumber(0)).toBe(true)
    expect(isFiniteNumber(-1.5)).toBe(true)
    expect(isFiniteNumber(Number.NaN)).toBe(false)
    expect(isFiniteNumber(Infinity)).toBe(false)
    expect(isFiniteNumber('1')).toBe(false)
    expect(isFiniteNumber(null)).toBe(false)
  })
})

describe('requireNonEmptyString', () => {
  it('passes a non-empty string through', () => {
    expect(requireNonEmptyString('x', fail, 'thing')).toBe('x')
  })

  it('rejects empty strings and non-strings', () => {
    expect(() => requireNonEmptyString('', fail, 'thing')).toThrow(/thing is missing or empty/)
    expect(() => requireNonEmptyString(undefined, fail, 'thing')).toThrow(/missing or empty/)
    expect(() => requireNonEmptyString(42, fail, 'thing')).toThrow(/missing or empty/)
  })
})

describe('requireLon / requireLat', () => {
  it('accepts the exact WGS84 boundary values', () => {
    expect(requireLon(-180, fail, 'p')).toBe(-180)
    expect(requireLon(180, fail, 'p')).toBe(180)
    expect(requireLat(-90, fail, 'p')).toBe(-90)
    expect(requireLat(90, fail, 'p')).toBe(90)
  })

  it('rejects values just past the boundary, non-finite values, and non-numbers', () => {
    expect(() => requireLon(180.000001, fail, 'p')).toThrow(/out-of-range longitude/)
    expect(() => requireLon(-180.000001, fail, 'p')).toThrow(/out-of-range longitude/)
    expect(() => requireLat(90.000001, fail, 'p')).toThrow(/out-of-range latitude/)
    expect(() => requireLat(Number.NaN, fail, 'p')).toThrow(/out-of-range latitude/)
    expect(() => requireLon('12', fail, 'p')).toThrow(/out-of-range longitude/)
  })
})

describe('requirePositiveNumber', () => {
  it('accepts strictly positive finite numbers', () => {
    expect(requirePositiveNumber(0.1, fail, 'n')).toBe(0.1)
  })

  it('rejects zero, negatives, non-finite and non-numbers', () => {
    expect(() => requirePositiveNumber(0, fail, 'n')).toThrow(/n is non-positive/)
    expect(() => requirePositiveNumber(-1, fail, 'n')).toThrow(/non-positive/)
    expect(() => requirePositiveNumber(Infinity, fail, 'n')).toThrow(/non-positive/)
    expect(() => requirePositiveNumber('5', fail, 'n')).toThrow(/non-positive/)
  })
})

describe('requireNullablePositiveNumber', () => {
  it('passes null through as an explicit "not applicable"', () => {
    expect(requireNullablePositiveNumber(null, fail, 'n')).toBeNull()
  })

  it('validates any present value as strictly positive', () => {
    expect(requireNullablePositiveNumber(5, fail, 'n')).toBe(5)
    expect(() => requireNullablePositiveNumber(0, fail, 'n')).toThrow(/non-positive/)
    expect(() => requireNullablePositiveNumber(undefined, fail, 'n')).toThrow(/non-positive/)
  })
})

describe('requireOneOf', () => {
  const allowed = ['a', 'b'] as const

  it('passes an allowed value through narrowed', () => {
    expect(requireOneOf('a', allowed, fail, 'v')).toBe('a')
  })

  it('rejects unknown values, listing what is allowed', () => {
    expect(() => requireOneOf('c', allowed, fail, 'v')).toThrow(/v is invalid \(want a\/b\)/)
    expect(() => requireOneOf(undefined, allowed, fail, 'v')).toThrow(/is invalid/)
  })
})

describe('requireNonEmptyArray', () => {
  it('passes a non-empty array through', () => {
    expect(requireNonEmptyArray([1], fail, 'things')).toEqual([1])
  })

  it('rejects non-arrays and empty arrays', () => {
    expect(() => requireNonEmptyArray({}, fail, 'things')).toThrow(/non-empty array of things/)
    expect(() => requireNonEmptyArray([], fail, 'things')).toThrow(/non-empty array of things/)
  })
})
