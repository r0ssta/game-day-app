import { describe, expect, it } from 'vitest'
import { isParentHubStaffPreviewRequest } from './parent-hub'

describe('isParentHubStaffPreviewRequest', () => {
  it('is true only for preview=1', () => {
    expect(isParentHubStaffPreviewRequest('?preview=1')).toBe(true)
    expect(isParentHubStaffPreviewRequest('?preview=true')).toBe(false)
    expect(isParentHubStaffPreviewRequest('')).toBe(false)
  })
})
