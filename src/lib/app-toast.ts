export type ToastTone = 'success' | 'error'

const ERROR_HINTS = [
  'failed',
  'could not',
  'select a team',
  'jersey number',
  'already used',
  'no active season',
  'is required',
  'not found',
  'invalid',
  'slow down',
  'you cannot',
  'try again',
  'unavailable',
  'denied',
  'error',
]

export function inferToastTone(message: string): ToastTone {
  const normalized = message.trim().toLowerCase()
  if (ERROR_HINTS.some((hint) => normalized.includes(hint))) return 'error'
  if (/(?:directors|admins) only$/.test(normalized)) return 'error'
  return 'success'
}
