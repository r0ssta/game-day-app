export const SUNLIGHT_MODE_STORAGE_KEY = 'game-day-sunlight-mode'

export function readSunlightMode(): boolean {
  try {
    return localStorage.getItem(SUNLIGHT_MODE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function applySunlightMode(enabled: boolean) {
  document.documentElement.classList.toggle('sunlight-mode', enabled)
}

export function persistSunlightMode(enabled: boolean) {
  try {
    localStorage.setItem(SUNLIGHT_MODE_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // Ignore storage failures (private browsing, quota, etc.)
  }
  applySunlightMode(enabled)
}
