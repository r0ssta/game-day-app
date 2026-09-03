import { describe, expect, it } from 'vitest'
import { isCoachAppPath, withCoachPath } from './app-routes'

describe('isCoachAppPath', () => {
  it('treats /coach and /admin as staff routes', () => {
    expect(isCoachAppPath('/coach')).toBe(true)
    expect(isCoachAppPath('/coach/')).toBe(true)
    expect(isCoachAppPath('/admin')).toBe(true)
    expect(isCoachAppPath('/admin/staff')).toBe(true)
  })

  it('leaves marketing and Parent Hub public', () => {
    expect(isCoachAppPath('/')).toBe(false)
    expect(isCoachAppPath('')).toBe(false)
    expect(isCoachAppPath('/hub/blitz')).toBe(false)
    expect(isCoachAppPath('/index.html')).toBe(false)
  })
})

describe('withCoachPath', () => {
  it('appends /coach to an origin', () => {
    expect(withCoachPath('https://example.com')).toBe('https://example.com/coach')
    expect(withCoachPath('https://example.com/')).toBe('https://example.com/coach')
  })
})
