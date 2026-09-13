import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  displayNameFromEmail,
  membersFromPresenceState,
  staffInitials,
  type MatchPresenceMember,
  type MatchPresenceState,
} from '@/lib/match-presence'
import { supabase } from '@/supabaseClient'

export type { MatchPresenceMember, MatchPresenceState }

/**
 * Staff currently viewing this live match, excluding the local user.
 * Channel: `match_presence:${matchId}`.
 */
export function useMatchPresence(matchId: string | null): MatchPresenceMember[] {
  const { user } = useAuth()
  const [others, setOthers] = useState<MatchPresenceMember[]>([])
  const userId = user?.id ?? null
  const email = user?.email ?? null

  useEffect(() => {
    if (!matchId || !userId) {
      setOthers([])
      return
    }

    let cancelled = false
    const channel = supabase.channel(`match_presence:${matchId}`, {
      config: { presence: { key: userId } },
    })

    const publishFromChannel = () => {
      if (cancelled) return
      setOthers(membersFromPresenceState(channel.presenceState(), userId))
    }

    channel
      .on('presence', { event: 'sync' }, publishFromChannel)
      .on('presence', { event: 'join' }, publishFromChannel)
      .on('presence', { event: 'leave' }, publishFromChannel)

    channel.subscribe(async (status) => {
      if (status !== 'SUBSCRIBED' || cancelled) return

      const [{ data: profile }, { data: role }] = await Promise.all([
        supabase.from('profiles').select('display_name, email').eq('id', userId).maybeSingle(),
        supabase.from('user_roles').select('display_name').eq('user_id', userId).maybeSingle(),
      ])
      if (cancelled) return

      const name =
        profile?.display_name?.trim() ||
        role?.display_name?.trim() ||
        displayNameFromEmail(profile?.email ?? email) ||
        'Coach'
      const payload: MatchPresenceState = {
        userId,
        name,
        initials: staffInitials(name),
        onlineAt: new Date().toISOString(),
      }
      await channel.track(payload)
    })

    return () => {
      cancelled = true
      setOthers([])
      void channel.unsubscribe()
      void supabase.removeChannel(channel)
    }
  }, [matchId, userId, email])

  return others
}
