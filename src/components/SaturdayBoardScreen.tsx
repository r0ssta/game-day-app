import { useEffect, useState } from 'react'
import { ScreenHeader } from '@/components/AppNavigation'
import { formatTeamDisplayName } from '@/lib/age-groups'
import { formatMatchDisplayDateTime } from '@/lib/match-schedule'
import { IN_PROGRESS_MATCH_STATUSES, isLiveMatchStatus } from '@/lib/match-status'
import {
  DEFAULT_MINUTES_TARGET_RATIO,
  matchBelongsOnSaturdayBoard,
  playersUnderMinutesTarget,
  weekendWindow,
  type MinutesShortfall,
  type SaturdayMatch,
} from '@/lib/saturday-board'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import { supabase } from '@/supabaseClient'
import type { DbTeam } from '@/types/database'

type SaturdayBoardScreenProps = {
  teams: DbTeam[]
  seasonId: string | null
  onBackToHome: () => void
}

type BoardState = {
  windowLabel: string
  matches: SaturdayMatch[]
  shortfalls: MinutesShortfall[]
}

function statusLabel(status: string): string {
  if (isLiveMatchStatus(status)) return 'Live'
  if (status === 'pending_review') return 'Recap open'
  if (status === 'final') return 'Final'
  if (status === 'postponed') return 'Postponed'
  if (status === 'cancelled') return 'Cancelled'
  return 'Scheduled'
}

export function SaturdayBoardScreen({ teams, seasonId, onBackToHome }: SaturdayBoardScreenProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [board, setBoard] = useState<BoardState | null>(null)

  useEffect(() => {
    let cancelled = false
    const activeTeams = teams.filter((team) => team.active_status !== false)
    const teamIds = activeTeams.map((team) => team.id)
    const window = weekendWindow(new Date())

    if (!seasonId || teamIds.length === 0) {
      setBoard({
        windowLabel: `${window.start} – ${window.end}`,
        matches: [],
        shortfalls: [],
      })
      setLoading(false)
      return
    }

    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const liveStatuses = IN_PROGRESS_MATCH_STATUSES.join(',')
        const [matchResult, rosterResult] = await Promise.all([
          supabase
            .from('matches')
            .select(
              'id, team_id, opponent, status, match_date, match_time, date, home_score, away_score, period, period_length, half_length, total_periods, is_test',
            )
            .eq('season_id', seasonId)
            .in('team_id', teamIds)
            .eq('is_test', false)
            .or(
              [
                `and(match_date.gte.${window.start},match_date.lte.${window.end})`,
                `and(match_date.is.null,date.gte.${window.start},date.lte."${window.end}T23:59:59")`,
                `status.in.(${liveStatuses})`,
              ].join(','),
            ),
          supabase
            .from('season_rosters')
            .select('team_id, player_id, players(first_name, last_name)')
            .eq('season_id', seasonId)
            .in('team_id', teamIds),
        ])
        if (matchResult.error) throw matchResult.error
        if (rosterResult.error) throw rosterResult.error

        const rows = (matchResult.data ?? []).filter((row) =>
          matchBelongsOnSaturdayBoard(
            { matchDate: row.match_date ?? row.date, status: row.status },
            window,
          ),
        )
        const playingTeamIds = [...new Set(rows.map((row) => row.team_id))]
        const completedResult =
          playingTeamIds.length === 0
            ? { data: [], error: null }
            : await supabase
                .from('matches')
                .select('id, team_id, status, period_length, half_length, total_periods')
                .eq('season_id', seasonId)
                .in('team_id', playingTeamIds)
                .in('status', ['final', 'pending_review'])
                .eq('is_test', false)
        if (completedResult.error) throw completedResult.error
        const completed = completedResult.data ?? []
        const statsResult =
          completed.length === 0
            ? { data: [], error: null }
            : await supabase
                .from('match_stats')
                .select('match_id, player_id, total_seconds_played, is_match_guest')
                .in(
                  'match_id',
                  completed.map((row) => row.id),
                )
        if (statsResult.error) throw statsResult.error

        const teamName = (teamId: string) => {
          const team = activeTeams.find((entry) => entry.id === teamId)
          return team ? formatTeamDisplayName(team.name, team.age_group) : 'Team'
        }

        const matches: SaturdayMatch[] = rows
          .map((row) => ({
            id: row.id,
            teamId: row.team_id,
            teamName: teamName(row.team_id),
            opponent: row.opponent,
            status: row.status,
            matchDate: row.match_date,
            matchTime: row.match_time,
            homeScore: row.home_score,
            awayScore: row.away_score,
            period: row.period,
          }))
          .sort((a, b) => `${a.matchDate ?? ''}T${a.matchTime ?? ''}`.localeCompare(`${b.matchDate ?? ''}T${b.matchTime ?? ''}`))

        const roster = (rosterResult.data ?? []).flatMap((row) => {
          const player = row.players
          const record = Array.isArray(player) ? player[0] : player
          if (!record) return []
          const name = [record.first_name, record.last_name].filter(Boolean).join(' ').trim()
          return [{ playerId: row.player_id, teamId: row.team_id, playerName: name || 'Player' }]
        })

        const shortfalls = playersUnderMinutesTarget({
          teams: activeTeams.map((team) => ({
            id: team.id,
            name: teamName(team.id),
            ratio: team.minutes_target_ratio ?? DEFAULT_MINUTES_TARGET_RATIO,
          })),
          matches: completed.map((row) => ({
            id: row.id,
            teamId: row.team_id,
            status: row.status,
            minutes: (row.period_length ?? row.half_length ?? 30) * (row.total_periods === 3 ? 3 : 2),
          })),
          stats: (statsResult.data ?? []).map((row) => ({
            matchId: row.match_id,
            playerId: row.player_id,
            seconds: row.total_seconds_played,
            guest: Boolean(row.is_match_guest),
          })),
          roster,
        }).filter((row) => rows.some((match) => match.team_id === row.teamId))

        if (!cancelled) {
          setBoard({
            windowLabel: `${window.start} – ${window.end}`,
            matches,
            shortfalls,
          })
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the Saturday board')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [seasonId, teams])

  return (
    <main className={`${APP_SHELL} pb-10`}>
      <div className={`${APP_CONTAINER} space-y-5 pt-6`}>
        <ScreenHeader
          title="Saturday board"
          subtitle={board ? board.windowLabel : 'This weekend'}
          onHome={onBackToHome}
        />
        {loading ? <p className="text-sm font-semibold text-muted-foreground">Loading club matches…</p> : null}
        {error ? (
          <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
            {error}
          </p>
        ) : null}
        {board && !loading ? (
          <>
            {board.matches.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                No club matches on this weekend.
              </p>
            ) : (
              <ul className="space-y-3">
                {board.matches.map((match) => {
                  const when = formatMatchDisplayDateTime({
                    date: match.matchDate ?? '',
                    match_date: match.matchDate,
                    match_time: match.matchTime,
                  })
                  return (
                    <li key={match.id} className="rounded-xl border border-border bg-card px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            {match.teamName}
                          </p>
                          <p className="font-display text-xl font-bold uppercase text-foreground">
                            vs {match.opponent || 'Opponent'}
                          </p>
                          <p className="text-xs font-semibold text-muted-foreground">
                            {when.dateLabel} · {when.timeLabel}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-neon">
                            {statusLabel(match.status)}
                            {isLiveMatchStatus(match.status) && match.period ? ` · ${match.period}` : ''}
                          </p>
                          {match.status !== 'scheduled' && match.status !== 'postponed' && match.status !== 'cancelled' ? (
                            <p className="font-mono text-lg font-black tabular-nums">
                              {match.homeScore}–{match.awayScore}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            <section className="space-y-2">
              <h2 className="font-display text-lg font-bold uppercase tracking-wide">Under the minutes line</h2>
              <p className="text-xs text-muted-foreground">
                Players on teams playing this weekend who are under half of that team’s completed minutes.
              </p>
              {board.shortfalls.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  Nobody is under the line.
                </p>
              ) : (
                <ul className="space-y-2">
                  {board.shortfalls.map((row) => (
                    <li key={`${row.teamId}:${row.playerId}`} className="rounded-xl border border-border bg-card px-4 py-3">
                      <p className="font-semibold text-foreground">{row.playerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.teamName} · {row.playedMinutes} min played · line {row.targetMinutes}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  )
}
