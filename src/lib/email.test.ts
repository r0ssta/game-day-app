import { describe, expect, it } from 'vitest'
import { EMAIL_INVALID_MESSAGE, isValidEmail, parseEmail } from './email'

describe('parseEmail', () => {
  it('accepts a normal address and lowercases it', () => {
    expect(parseEmail('  Coach@Club.COM ')).toEqual({
      ok: true,
      value: 'coach@club.com',
    })
  })

  it('rejects empty, missing-domain, and whitespace values', () => {
    expect(isValidEmail('')).toBe(false)
    expect(parseEmail('not-an-email')).toEqual({
      ok: false,
      error: EMAIL_INVALID_MESSAGE,
    })
    expect(parseEmail('coach@club')).toEqual({
      ok: false,
      error: EMAIL_INVALID_MESSAGE,
    })
  })
})
