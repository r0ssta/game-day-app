const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'password',
  'tel',
  'url',
  'number',
])

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/**
 * Edits we rewrite ourselves on iOS. Preventing the browser's default keeps
 * WebKit from pushing a shake-to-undo ("Undo Typing") entry.
 */
const INTERCEPTED_INPUT_TYPES = new Set([
  'insertText',
  'insertReplacementText',
  'insertFromPaste',
  'insertFromDrop',
  'insertFromYank',
  'insertLineBreak',
  'insertParagraph',
  'deleteContent',
  'deleteContentBackward',
  'deleteContentForward',
  'deleteByCut',
  'deleteByDrag',
])

/** iOS names the shake alert from the last text edit ("Undo Edit" / "Undo Typing"). */
export function isHistoryUndoInput(inputType: string): boolean {
  return inputType === 'historyUndo' || inputType === 'historyRedo'
}

export function isShakeUndoInputType(type: string | null | undefined): boolean {
  const normalized = (type ?? 'text').toLowerCase()
  return TEXT_INPUT_TYPES.has(normalized)
}

export function isInterceptedShakeUndoInputType(inputType: string): boolean {
  return INTERCEPTED_INPUT_TYPES.has(inputType)
}

export function nextValueAfterTextEdit(args: {
  value: string
  selectionStart: number
  selectionEnd: number
  inputType: string
  data: string | null
}): { value: string; caret: number } | null {
  const { value, selectionStart, selectionEnd, inputType, data } = args
  const start = Math.max(0, Math.min(selectionStart, value.length))
  const end = Math.max(start, Math.min(selectionEnd, value.length))

  switch (inputType) {
    case 'insertText':
    case 'insertReplacementText':
    case 'insertFromPaste':
    case 'insertFromDrop':
    case 'insertFromYank': {
      const inserted = data ?? ''
      return {
        value: value.slice(0, start) + inserted + value.slice(end),
        caret: start + inserted.length,
      }
    }
    case 'insertLineBreak':
    case 'insertParagraph':
      return {
        value: value.slice(0, start) + '\n' + value.slice(end),
        caret: start + 1,
      }
    case 'deleteContent':
    case 'deleteByCut':
    case 'deleteByDrag':
      return {
        value: value.slice(0, start) + value.slice(end),
        caret: start,
      }
    case 'deleteContentBackward':
      if (start !== end) {
        return { value: value.slice(0, start) + value.slice(end), caret: start }
      }
      if (start === 0) return { value, caret: 0 }
      return { value: value.slice(0, start - 1) + value.slice(end), caret: start - 1 }
    case 'deleteContentForward':
      if (start !== end) {
        return { value: value.slice(0, start) + value.slice(end), caret: start }
      }
      if (start >= value.length) return { value, caret: start }
      return { value: value.slice(0, start) + value.slice(start + 1), caret: start }
    default:
      return null
  }
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

function setFieldValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  if (descriptor?.set) {
    descriptor.set.call(el, value)
  } else {
    el.value = value
  }
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
  setFieldValue(el, `${value}\u200b`)
  setFieldValue(el, value)
  if (start == null || end == null) return
  try {
    el.setSelectionRange(start, end, direction ?? 'none')
  } catch {
    // number inputs reject a selection range
  }
}

function scheduleClearUndoStack(field: HTMLInputElement | HTMLTextAreaElement) {
  const run = () => {
    if (!field.isConnected) return
    clearTextFieldUndoStack(field)
  }
  // After React commits controlled updates; do not skip when the value changed —
  // that race was leaving the iOS undo stack intact for opponent/notes fields.
  queueMicrotask(run)
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      run()
      setTimeout(run, 0)
    })
  } else {
    setTimeout(run, 0)
  }
}

function applyInterceptedEdit(
  field: HTMLInputElement | HTMLTextAreaElement,
  event: InputEvent,
): boolean {
  const start = field.selectionStart
  const end = field.selectionEnd
  if (start == null || end == null) return false

  const next = nextValueAfterTextEdit({
    value: field.value,
    selectionStart: start,
    selectionEnd: end,
    inputType: event.inputType,
    data: event.data,
  })
  if (!next) return false

  setFieldValue(field, next.value)
  try {
    field.setSelectionRange(next.caret, next.caret)
  } catch {
    // number inputs reject a selection range
  }
  field.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      cancelable: false,
      inputType: event.inputType,
      data: event.data,
    }),
  )
  return true
}

let installed = false

export function installDisableShakeUndo() {
  if (installed || typeof document === 'undefined') return
  installed = true

  const ios = typeof navigator !== 'undefined' && isIosDevice()

  document.addEventListener(
    'beforeinput',
    (event) => {
      if (!(event instanceof InputEvent) || !isTextField(event.target)) return

      if (isHistoryUndoInput(event.inputType)) {
        event.preventDefault()
        return
      }

      if (!ios || event.isComposing || !isInterceptedShakeUndoInputType(event.inputType)) return

      // Apply the edit in JS so WebKit never records a shake-to-undo typing action.
      // Without this, the alert still appears after navigating away from the field.
      if (applyInterceptedEdit(event.target, event)) {
        event.preventDefault()
      }
    },
    true,
  )

  if (!ios) return

  const scheduleClear = (target: EventTarget | null) => {
    if (!isTextField(target)) return
    scheduleClearUndoStack(target)
  }

  document.addEventListener('input', (event) => {
    if (event instanceof InputEvent && event.isComposing) return
    // Intercepted edits already avoided the undo stack; still clear as a belt-and-suspenders
    // pass for autocorrect, swipe typing, and anything we did not rewrite.
    scheduleClear(event.target)
  })
  document.addEventListener('compositionend', (event) => scheduleClear(event.target))
  document.addEventListener(
    'focusout',
    (event) => {
      if (!isTextField(event.target)) return
      clearTextFieldUndoStack(event.target)
    },
    true,
  )
}
