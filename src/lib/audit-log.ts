import { isAutomationStaffEmail } from '@/lib/automation-staff'
import { supabase } from '@/supabaseClient'
import type { DbAuditLog, DbStaffLastSeen, Json } from '@/types/database'

/** Don't log another app_opened for the same user within this window. */
export const APP_OPENED_DEBOUNCE_MS = 6 * 60 * 60 * 1000

/** Refresh last-seen while the staff app is in use, without flooding the event log. */
export const LAST_SEEN_TOUCH_MS = 5 * 60 * 1000

const lastOpenedAtByUser = new Map<string, number>()
const lastSeenAtByUser = new Map<string, number>()

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
}): Promise<boolean> {
  const actionType = input.actionType.trim()
  if (!actionType) return false
  if (isAutomationStaffEmail(input.metadata?.email as string | undefined)) return false

  const { data: sessionData } = await supabase.auth.getSession()
  if (isAutomationStaffEmail(sessionData.session?.user.email)) return false

  const { error } = await supabase.rpc('log_system_activity', {
    p_action_type: actionType,
    p_club_id: input.clubId ?? null,
    p_team_id: input.teamId ?? null,
    p_metadata: (input.metadata ?? {}) as DbAuditLog['metadata'],
  })
  if (error) {
    console.warn('[audit] failed to log activity', error.message)
    return false
  }
  return true
}

async function touchStaffLastSeen(input: {
  actionType: string
  clubId?: string | null
  email?: string | null
}): Promise<boolean> {
  const { error } = await supabase.rpc('touch_staff_last_seen', {
    p_action_type: input.actionType,
    p_club_id: input.clubId ?? null,
    p_email: input.email?.trim() || null,
  })
  if (error) {
    console.warn('[audit] failed to touch last seen', error.message)
    return false
  }
  return true
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

export async function fetchStaffLastSeen(): Promise<StaffLastActive[]> {
  const { data, error } = await supabase
    .from('staff_last_seen')
    .select('user_id, last_seen_at, last_action, email')
    .order('last_seen_at', { ascending: false })
  if (error) throw error
  return (data ?? [])
    .filter((row) => !isAutomationStaffEmail(row.email))
    .map(staffLastSeenToActive)
}

export function shouldRecordAppOpened(lastRecordedAt: number | null, now: number): boolean {
  if (lastRecordedAt == null) return true
  return now - lastRecordedAt >= APP_OPENED_DEBOUNCE_MS
}

export function shouldTouchLastSeen(lastTouchedAt: number | null, now: number): boolean {
  if (lastTouchedAt == null) return true
  return now - lastTouchedAt >= LAST_SEEN_TOUCH_MS
}

function appOpenedStorageKey(userId: string): string {
  return `audit:app_opened:${userId}`
}

function lastSeenStorageKey(userId: string): string {
  return `audit:last_seen:${userId}`
}

function readStoredTimestamp(memory: Map<string, number>, storageKey: string, userId: string): number | null {
  const fromMemory = memory.get(userId) ?? null
  let stored: number | null = null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (raw) {
      const parsed = Number(raw)
      stored = Number.isFinite(parsed) ? parsed : null
    }
  } catch {
    stored = null
  }
  if (fromMemory == null) return stored
  if (stored == null) return fromMemory
  return Math.max(fromMemory, stored)
}

function rememberTimestamp(memory: Map<string, number>, storageKey: string, userId: string, at: number): void {
  memory.set(userId, at)
  try {
    window.localStorage.setItem(storageKey, String(at))
  } catch {
    // Private mode — in-memory debounce still prevents a visibility-change flood.
  }
}

function forgetTimestamp(memory: Map<string, number>, storageKey: string, userId: string): void {
  memory.delete(userId)
  try {
    window.localStorage.removeItem(storageKey)
  } catch {
    // Private mode — in-memory debounce is enough.
  }
}

function readStoredOpenedAt(userId: string): number | null {
  return readStoredTimestamp(lastOpenedAtByUser, appOpenedStorageKey(userId), userId)
}

function rememberOpenedAt(userId: string, at: number): void {
  rememberTimestamp(lastOpenedAtByUser, appOpenedStorageKey(userId), userId, at)
}

function forgetOpenedAt(userId: string): void {
  forgetTimestamp(lastOpenedAtByUser, appOpenedStorageKey(userId), userId)
}

function readStoredLastSeenAt(userId: string): number | null {
  return readStoredTimestamp(lastSeenAtByUser, lastSeenStorageKey(userId), userId)
}

function rememberLastSeenAt(userId: string, at: number): void {
  rememberTimestamp(lastSeenAtByUser, lastSeenStorageKey(userId), userId, at)
}

function forgetLastSeenAt(userId: string): void {
  forgetTimestamp(lastSeenAtByUser, lastSeenStorageKey(userId), userId)
}

function staffLastSeenToActive(row: Pick<DbStaffLastSeen, 'user_id' | 'last_seen_at' | 'last_action' | 'email'>): StaffLastActive {
  return {
    userId: row.user_id,
    lastAt: row.last_seen_at,
    lastAction: row.last_action,
    email: row.email,
  }
}

/** Persist recency (every 5 min) and a coarse app_opened audit row (every 6 hours). */
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
  const email = input.email?.trim() || null
  const clubId = input.clubId ?? null

  if (shouldTouchLastSeen(readStoredLastSeenAt(userId), now)) {
    rememberLastSeenAt(userId, now)
    void touchStaffLastSeen({
      actionType: 'app_opened',
      clubId,
      email,
    }).then((ok) => {
      if (!ok) forgetLastSeenAt(userId)
    })
  }

  if (!shouldRecordAppOpened(readStoredOpenedAt(userId), now)) return
  rememberOpenedAt(userId, now)

  void logSystemActivity({
    actionType: 'app_opened',
    clubId,
    metadata: {
      email,
    },
  }).then((ok) => {
    if (!ok) forgetOpenedAt(userId)
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
