import { describe, expect, it } from 'vitest'
import { isLandingPath } from './app-routes'

describe('isLandingPath', () => {
  it('only matches /waitlist', () => {
    expect(isLandingPath('/waitlist')).toBe(true)
    expect(isLandingPath('/waitlist/')).toBe(true)
  })

  it('leaves coach root, aliases, and Parent Hub alone', () => {
    expect(isLandingPath('/')).toBe(false)
    expect(isLandingPath('')).toBe(false)
    expect(isLandingPath('/coach')).toBe(false)
    expect(isLandingPath('/admin')).toBe(false)
    expect(isLandingPath('/hub/blitz')).toBe(false)
    expect(isLandingPath('/index.html')).toBe(false)
  })
})
