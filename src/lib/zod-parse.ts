import type { z } from 'zod'

/**
 * Validate a single DB/API row. Returns null (and logs) instead of throwing when
 * the payload is malformed — keeps the UI from hitting unhandled TypeErrors.
 */
export function parseDbRow<T>(
  schema: z.ZodType<T>,
  row: unknown,
  label: string,
): T | null {
  if (row == null) return null
  const result = schema.safeParse(row)
  if (result.success) return result.data
  console.warn(`[zod] ${label}: invalid row skipped`, result.error.flatten())
  return null
}

/**
 * Validate a list of rows, dropping invalid ones so one bad record cannot crash
 * an entire list screen.
 */
export function parseDbRows<T>(
  schema: z.ZodType<T>,
  rows: unknown,
  label: string,
): T[] {
  if (!Array.isArray(rows)) {
    if (rows != null) {
      console.warn(`[zod] ${label}: expected array, got`, typeof rows)
    }
    return []
  }

  const out: T[] = []
  for (const [index, row] of rows.entries()) {
    const parsed = parseDbRow(schema, row, `${label}[${index}]`)
    if (parsed) out.push(parsed)
  }
  return out
}
