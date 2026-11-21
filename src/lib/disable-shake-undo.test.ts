import { describe, expect, it } from 'vitest'
import {
  isHistoryUndoInput,
  isInterceptedShakeUndoInputType,
  isShakeUndoInputType,
  nextValueAfterTextEdit,
} from './disable-shake-undo'

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

describe('isInterceptedShakeUndoInputType', () => {
  it('covers typing and simple deletes we rewrite on iOS', () => {
    expect(isInterceptedShakeUndoInputType('insertText')).toBe(true)
    expect(isInterceptedShakeUndoInputType('insertFromPaste')).toBe(true)
    expect(isInterceptedShakeUndoInputType('deleteContentBackward')).toBe(true)
    expect(isInterceptedShakeUndoInputType('deleteWordBackward')).toBe(false)
    expect(isInterceptedShakeUndoInputType('historyUndo')).toBe(false)
  })
})

describe('nextValueAfterTextEdit', () => {
  it('inserts text at the caret', () => {
    expect(
      nextValueAfterTextEdit({
        value: 'Bea',
        selectionStart: 3,
        selectionEnd: 3,
        inputType: 'insertText',
        data: 'ch',
      }),
    ).toEqual({ value: 'Beach', caret: 5 })
  })

  it('replaces a selection on paste', () => {
    expect(
      nextValueAfterTextEdit({
        value: 'old name',
        selectionStart: 0,
        selectionEnd: 3,
        inputType: 'insertFromPaste',
        data: 'new',
      }),
    ).toEqual({ value: 'new name', caret: 3 })
  })

  it('deletes the previous character', () => {
    expect(
      nextValueAfterTextEdit({
        value: 'ab',
        selectionStart: 2,
        selectionEnd: 2,
        inputType: 'deleteContentBackward',
        data: null,
      }),
    ).toEqual({ value: 'a', caret: 1 })
  })

  it('deletes a selection backward without eating an extra character', () => {
    expect(
      nextValueAfterTextEdit({
        value: 'abcdef',
        selectionStart: 2,
        selectionEnd: 4,
        inputType: 'deleteContentBackward',
        data: null,
      }),
    ).toEqual({ value: 'abef', caret: 2 })
  })

  it('inserts a line break in notes', () => {
    expect(
      nextValueAfterTextEdit({
        value: 'line',
        selectionStart: 4,
        selectionEnd: 4,
        inputType: 'insertLineBreak',
        data: null,
      }),
    ).toEqual({ value: 'line\n', caret: 5 })
  })

  it('returns null for input types we leave to the browser', () => {
    expect(
      nextValueAfterTextEdit({
        value: 'ab',
        selectionStart: 2,
        selectionEnd: 2,
        inputType: 'deleteWordBackward',
        data: null,
      }),
    ).toBeNull()
  })
})
