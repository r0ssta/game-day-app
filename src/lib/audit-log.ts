import { isAutomationStaffEmail } from '@/lib/automation-staff'
import { supabase } from '@/supabaseClient'
import type { DbAuditLog, Json } from '@/types/database'

/** Don't log another app_opened for the same user within this window. */
export const APP_OPENED_DEBOUNCE_MS = 6 * 60 * 60 * 1000

const lastOpenedAtByUser = new Map<string, number>()

export type StaffLastActive = {
  userId: string
  lastAt: string
  lastAction: string
  email: string | null
}

export async function logSystemActivity(input: {
  actionType: string
  clubId?: string | null
  teamId?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  const actionType = input.actionType.trim()
  if (!actionType) return
  if (isAutomationStaffEmail(input.metadata?.email as string | undefined)) return

  const { data: sessionData } = await supabase.auth.getSession()
  if (isAutomationStaffEmail(sessionData.session?.user.email)) return

  const { error } = await supabase.rpc('log_system_activity', {
    p_action_type: actionType,
    p_club_id: input.clubId ?? null,
    p_team_id: input.teamId ?? null,
    p_metadata: (input.metadata ?? {}) as DbAuditLog['metadata'],
  })
  if (error) {
    console.warn('[audit] failed to log activity', error.message)
  }
}

export async function fetchAuditLogs(limit = 200): Promise<DbAuditLog[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, user_id, club_id, team_id, action_type, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).filter((row) => !isAutomationStaffEmail(emailFromAuditMetadata(row.metadata)))
}

export function shouldRecordAppOpened(lastRecordedAt: number | null, now: number): boolean {
  if (lastRecordedAt == null) return true
  return now - lastRecordedAt >= APP_OPENED_DEBOUNCE_MS
}

function appOpenedStorageKey(userId: string): string {
  return `audit:app_opened:${userId}`
}

function readStoredOpenedAt(userId: string): number | null {
  const memory = lastOpenedAtByUser.get(userId) ?? null
  let stored: number | null = null
  try {
    const raw = window.localStorage.getItem(appOpenedStorageKey(userId))
    if (raw) {
      const parsed = Number(raw)
      stored = Number.isFinite(parsed) ? parsed : null
    }
  } catch {
    stored = null
  }
  if (memory == null) return stored
  if (stored == null) return memory
  return Math.max(memory, stored)
}

function rememberOpenedAt(userId: string, at: number): void {
  lastOpenedAtByUser.set(userId, at)
  try {
    window.localStorage.setItem(appOpenedStorageKey(userId), String(at))
  } catch {
    // Private mode — in-memory debounce still prevents a visibility-change flood.
  }
}

/** Persist a coarse "they had the staff app open" row, at most every 6 hours. */
export function noteStaffAppPresence(input: {
  userId: string
  email?: string | null
  clubId?: string | null
}): void {
  if (typeof window === 'undefined') return
  const userId = input.userId.trim()
  if (!userId) return
  if (isAutomationStaffEmail(input.email)) return

  const now = Date.now()
  if (!shouldRecordAppOpened(readStoredOpenedAt(userId), now)) return
  rememberOpenedAt(userId, now)

  void logSystemActivity({
    actionType: 'app_opened',
    clubId: input.clubId ?? null,
    metadata: {
      email: input.email?.trim() || null,
    },
  })
}

export function emailFromAuditMetadata(metadata: DbAuditLog['metadata']): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const email = metadata.email
  return typeof email === 'string' && email.trim() ? email.trim() : null
}

export function extraAuditMetadata(metadata: DbAuditLog['metadata']): Record<string, Json | undefined> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const rest: Record<string, Json | undefined> = { ...metadata }
  delete rest.email
  return Object.keys(rest).length > 0 ? rest : null
}

/** Newest-first logs → one row per user with their most recent action. */
export function summarizeLastActive(logs: DbAuditLog[]): StaffLastActive[] {
  const byUser = new Map<string, StaffLastActive>()
  const emails = new Map<string, string>()

  for (const row of logs) {
    if (!row.user_id) continue
    const email = emailFromAuditMetadata(row.metadata)
    if (isAutomationStaffEmail(email)) continue
    if (email && !emails.has(row.user_id)) emails.set(row.user_id, email)
    if (byUser.has(row.user_id)) continue
    byUser.set(row.user_id, {
      userId: row.user_id,
      lastAt: row.created_at,
      lastAction: row.action_type,
      email,
    })
  }

  return [...byUser.values()].map((row) => ({
    ...row,
    email: row.email ?? emails.get(row.userId) ?? null,
  }))
}
