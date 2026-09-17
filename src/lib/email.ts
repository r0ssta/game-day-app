export const EMAIL_INVALID_MESSAGE = 'Enter a valid email address'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(raw: string): boolean {
  return EMAIL_RE.test(raw.trim())
}

export function parseEmail(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim().toLowerCase()
  if (!isValidEmail(value)) return { ok: false, error: EMAIL_INVALID_MESSAGE }
  return { ok: true, value }
}
