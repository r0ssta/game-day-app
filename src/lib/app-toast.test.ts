import { describe, expect, it } from 'vitest'
import { inferToastTone } from './app-toast'

describe('inferToastTone', () => {
  it('marks failure copy as an error', () => {
    expect(inferToastTone('Failed to add player')).toBe('error')
    expect(inferToastTone('Jersey number must be a whole number from 0 to 99')).toBe('error')
    expect(inferToastTone('That jersey number is already used on this team')).toBe('error')
    expect(inferToastTone('Could not load the scheduled match')).toBe('error')
  })

  it('keeps success copy as success', () => {
    expect(inferToastTone('Added #7 Jane Doe')).toBe('success')
    expect(inferToastTone('Match deleted')).toBe('success')
  })
})
