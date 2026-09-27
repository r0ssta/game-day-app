import { describe, expect, it } from 'vitest'
import { isHistoryUndoInput, isShakeUndoInputType } from './disable-shake-undo'

describe('isHistoryUndoInput', () => {
  it('matches the shake-to-undo input types', () => {
    expect(isHistoryUndoInput('historyUndo')).toBe(true)
    expect(isHistoryUndoInput('historyRedo')).toBe(true)
    expect(isHistoryUndoInput('insertText')).toBe(false)
  })
})

describe('isShakeUndoInputType', () => {
  it('covers text fields and skips toggles', () => {
    expect(isShakeUndoInputType('text')).toBe(true)
    expect(isShakeUndoInputType(undefined)).toBe(true)
    expect(isShakeUndoInputType('search')).toBe(true)
    expect(isShakeUndoInputType('checkbox')).toBe(false)
    expect(isShakeUndoInputType('date')).toBe(false)
  })
})
