import { describe, expect, it } from 'vitest'
import {
  assertJerseyNumber,
  JERSEY_IN_USE_MESSAGE,
  JERSEY_NUMBER_RANGE_MESSAGE,
  parseJerseyNumber,
  parseJerseyNumberOrThrow,
  rosterHasJersey,
} from './jersey-number'

describe('parseJerseyNumber', () => {
  it('allows an empty optional jersey', () => {
    expect(parseJerseyNumber('')).toEqual({ ok: true, value: null })
    expect(parseJerseyNumber('   ')).toEqual({ ok: true, value: null })
    expect(parseJerseyNumber('#')).toEqual({ ok: true, value: null })
  })

  it('accepts whole numbers from 0 to 99', () => {
    expect(parseJerseyNumber('0')).toEqual({ ok: true, value: 0 })
    expect(parseJerseyNumber('7')).toEqual({ ok: true, value: 7 })
    expect(parseJerseyNumber('#11')).toEqual({ ok: true, value: 11 })
    expect(parseJerseyNumber('99')).toEqual({ ok: true, value: 99 })
  })

  it('rejects negatives, decimals, and oversized values', () => {
    expect(parseJerseyNumber('-5')).toEqual({ ok: false, error: JERSEY_NUMBER_RANGE_MESSAGE })
    expect(parseJerseyNumber('3.5')).toEqual({ ok: false, error: JERSEY_NUMBER_RANGE_MESSAGE })
    expect(parseJerseyNumber('100')).toEqual({ ok: false, error: JERSEY_NUMBER_RANGE_MESSAGE })
    expect(parseJerseyNumber('999999999999')).toEqual({
      ok: false,
      error: JERSEY_NUMBER_RANGE_MESSAGE,
    })
  })
})

describe('assertJerseyNumber', () => {
  it('returns null for missing values and throws for invalid numbers', () => {
    expect(assertJerseyNumber(null)).toBeNull()
    expect(assertJerseyNumber(12)).toBe(12)
    expect(() => assertJerseyNumber(-5)).toThrow(JERSEY_NUMBER_RANGE_MESSAGE)
    expect(() => assertJerseyNumber(3.5)).toThrow(JERSEY_NUMBER_RANGE_MESSAGE)
    expect(() => assertJerseyNumber(100)).toThrow(JERSEY_NUMBER_RANGE_MESSAGE)
  })
})

describe('parseJerseyNumberOrThrow', () => {
  it('throws the range message for invalid input', () => {
    expect(parseJerseyNumberOrThrow('8')).toBe(8)
    expect(() => parseJerseyNumberOrThrow('-1')).toThrow(JERSEY_NUMBER_RANGE_MESSAGE)
  })
})

describe('rosterHasJersey', () => {
  const roster = [
    { id: 'a', number: 7 },
    { id: 'b', number: null },
    { id: 'c', number: 11 },
  ]

  it('detects a taken number and can ignore the player being edited', () => {
    expect(rosterHasJersey(roster, 7)).toBe(true)
    expect(rosterHasJersey(roster, 7, 'a')).toBe(false)
    expect(rosterHasJersey(roster, 8)).toBe(false)
    expect(rosterHasJersey(roster, null)).toBe(false)
    expect(JERSEY_IN_USE_MESSAGE).toMatch(/already used/i)
  })
})
