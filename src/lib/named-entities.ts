/** Merge a new name into a sorted, deduplicated list (case-insensitive). */
export function addDistinctName(names: string[], name: string): string[] {
  const trimmed = name.trim()
  if (!trimmed) return names

  const exists = names.some((n) => n.toLowerCase() === trimmed.toLowerCase())
  if (exists) return names

  return [...names, trimmed].sort((a, b) => a.localeCompare(b))
}

export function normalizeNameList(names: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(names)) return fallback
  const unique = new Map<string, string>()
  for (const name of names) {
    if (typeof name !== 'string') continue
    const trimmed = name.trim()
    if (!trimmed) continue
    unique.set(trimmed.toLowerCase(), trimmed)
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b))
}

export function nameShort(name: string, fallback = 'TM') {
  const trimmed = name.trim()
  if (!trimmed) return fallback
  return trimmed.slice(0, 3).toUpperCase()
}

export const ADD_NEW_OPTION = '__add_new__'
