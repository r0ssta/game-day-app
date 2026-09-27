const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'password',
  'tel',
  'url',
  'number',
])

/** iOS names the shake alert from the last text edit ("Undo Edit" / "Undo Typing"). */
export function isHistoryUndoInput(inputType: string): boolean {
  return inputType === 'historyUndo' || inputType === 'historyRedo'
}

export function isShakeUndoInputType(type: string | null | undefined): boolean {
  const normalized = (type ?? 'text').toLowerCase()
  return TEXT_INPUT_TYPES.has(normalized)
}

function isTextField(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  if (typeof HTMLTextAreaElement !== 'undefined' && target instanceof HTMLTextAreaElement) {
    return true
  }
  if (typeof HTMLInputElement !== 'undefined' && target instanceof HTMLInputElement) {
    return isShakeUndoInputType(target.type)
  }
  return false
}

/**
 * WebKit ignores a same-value write, which leaves the shake-to-undo stack intact.
 * A different value, then the original, drops that stack so a shake has no alert.
 */
export function clearTextFieldUndoStack(el: HTMLInputElement | HTMLTextAreaElement) {
  const value = el.value
  const start = el.selectionStart
  const end = el.selectionEnd
  const direction = el.selectionDirection
  el.value = `${value}\u200b`
  el.value = value
  if (start == null || end == null) return
  try {
    el.setSelectionRange(start, end, direction ?? 'none')
  } catch {
    // number inputs reject a selection range
  }
}

let installed = false

export function installDisableShakeUndo() {
  if (installed || typeof document === 'undefined') return
  installed = true

  document.addEventListener(
    'beforeinput',
    (event) => {
      if (!(event instanceof InputEvent) || !isHistoryUndoInput(event.inputType)) return
      event.preventDefault()
    },
    true,
  )

  const scheduleClear = (target: EventTarget | null) => {
    if (!isTextField(target)) return
    const field = target
    const value = field.value
    // React's value tracker treats a `.value` write during this event as the
    // keystroke already being applied, then drops onChange. Controlled fields
    // (opponent, notes) snap back to empty. Clear the undo stack after the event.
    queueMicrotask(() => {
      if (!field.isConnected || field.value !== value) return
      clearTextFieldUndoStack(field)
    })
  }

  document.addEventListener('input', (event) => {
    if (event instanceof InputEvent && event.isComposing) return
    scheduleClear(event.target)
  })
  document.addEventListener('compositionend', (event) => scheduleClear(event.target))
}
