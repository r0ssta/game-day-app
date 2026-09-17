import { supabase } from '@/supabaseClient'
import type { DbAuditLog } from '@/types/database'

export async function logSystemActivity(input: {
  actionType: string
  clubId?: string | null
  teamId?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  const actionType = input.actionType.trim()
  if (!actionType) return

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
  return data ?? []
}
