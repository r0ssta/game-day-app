import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Search, Users } from 'lucide-react'
import { PlayerDevelopmentReportView } from '@/components/PlayerDevelopmentReport'
import {
  AGE_GROUPS,
  type AgeGroup,
  formatTeamDisplayName,
  isAgeGroup,
} from '@/lib/age-groups'
import { formatPlayerFullName } from '@/lib/player-names'
import { fetchClubPlayers, fetchSeasonRosterTeamByPlayerId } from '@/lib/supabase-api'
import type { DbPlayer, DbSeason, DbTeam } from '@/types/database'
import { cn } from '@/lib/utils'

type PlayerDirectoryPanelProps = {
  teams: DbTeam[]
  activeSeason: DbSeason | null
  onToast: (message: string) => void
}

export function PlayerDirectoryPanel({
  teams,
  activeSeason,
  onToast,
}: PlayerDirectoryPanelProps) {
  const [players, setPlayers] = useState<DbPlayer[]>([])
  const [rosterTeamByPlayerId, setRosterTeamByPlayerId] = useState<Map<string, string>>(
    () => new Map(),
  )
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [ageGroup, setAgeGroup] = useState<AgeGroup | 'all'>('all')
  const [teamId, setTeamId] = useState<string | 'all' | 'unassigned'>('all')
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)

  const activeTeams = useMemo(
    () =>
      teams
        .filter((team) => team.active_status !== false)
        .slice()
        .sort((a, b) =>
          formatTeamDisplayName(a.name, a.age_group).localeCompare(
            formatTeamDisplayName(b.name, b.age_group),
            undefined,
            { sensitivity: 'base' },
          ),
        ),
    [teams],
  )

  const teamsForAgeGroup = useMemo(
    () =>
      ageGroup === 'all'
        ? activeTeams
        : activeTeams.filter((team) => team.age_group === ageGroup),
    [activeTeams, ageGroup],
  )

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const team of teams) {
      map.set(team.id, formatTeamDisplayName(team.name, team.age_group))
    }
    return map
  }, [teams])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void Promise.all([
      fetchClubPlayers({ includeInactive: false }),
      activeSeason?.id
        ? fetchSeasonRosterTeamByPlayerId(activeSeason.id)
        : Promise.resolve(new Map<string, string>()),
    ])
      .then(([rows, rosterMap]) => {
        if (cancelled) return
        setPlayers(rows)
        setRosterTeamByPlayerId(rosterMap)
      })
      .catch((err) => {
        if (!cancelled) {
          onToast(err instanceof Error ? err.message : 'Failed to load players')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeSeason?.id, onToast])

  // Drop a team selection that isn't in the current age-group list.
  useEffect(() => {
    if (teamId === 'all' || teamId === 'unassigned') return
    if (!teamsForAgeGroup.some((team) => team.id === teamId)) {
      setTeamId('all')
    }
  }, [teamId, teamsForAgeGroup])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return players.filter((player) => {
      if (ageGroup !== 'all' && player.age_group !== ageGroup) return false

      const rosterTeamId = rosterTeamByPlayerId.get(player.id)
      if (teamId === 'unassigned') {
        if (rosterTeamId) return false
      } else if (teamId !== 'all') {
        if (rosterTeamId !== teamId) return false
      }

      if (!q) return true
      const name = `${player.first_name} ${player.last_name}`.toLowerCase()
      const jersey = player.jersey != null ? String(player.jersey) : ''
      const teamLabel = rosterTeamId
        ? (teamNameById.get(rosterTeamId) ?? '').toLowerCase()
        : ''
      return name.includes(q) || jersey.includes(q) || teamLabel.includes(q)
    })
  }, [players, ageGroup, teamId, query, rosterTeamByPlayerId, teamNameById])

  if (selectedPlayerId) {
    return (
      <PlayerDevelopmentReportView
        playerId={selectedPlayerId}
        teams={teams}
        activeSeason={activeSeason}
        onBack={() => setSelectedPlayerId(null)}
        onToast={onToast}
      />
    )
  }

  return (
    <section className="player-directory-panel mt-6 space-y-4 rounded-2xl border-2 border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Users className="size-5 text-athletic" strokeWidth={2.5} />
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
          Player Directory
        </h2>
      </div>
      <p className="text-xs font-semibold text-muted-foreground">
        Club-wide directory. Filter by age group and active-season team, then open a player for
        their development report.
      </p>

      <div className="grid gap-2 sm:grid-cols-[1fr_8rem_minmax(0,12rem)]">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, #, or team"
            className="min-h-12 w-full touch-manipulation rounded-xl border-2 border-border bg-background py-2 pl-10 pr-3 text-sm font-bold text-foreground"
          />
        </label>
        <label className="block">
          <span className="sr-only">Age group</span>
          <select
            value={ageGroup}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'all') setAgeGroup('all')
              else if (isAgeGroup(value)) setAgeGroup(value)
            }}
            className="min-h-12 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-bold text-foreground"
          >
            <option value="all">All ages</option>
            {AGE_GROUPS.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="sr-only">Team</span>
          <select
            value={teamId}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'all' || value === 'unassigned') setTeamId(value)
              else setTeamId(value)
            }}
            className="min-h-12 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-bold text-foreground"
          >
            <option value="all">All teams</option>
            <option value="unassigned">Unassigned</option>
            {teamsForAgeGroup.map((team) => (
              <option key={team.id} value={team.id}>
                {formatTeamDisplayName(team.name, team.age_group)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!activeSeason ? (
        <p className="text-xs font-semibold text-muted-foreground">
          Set an active season to filter by current team roster.
        </p>
      ) : null}

      <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
        {loading ? (
          <li className="py-8 text-center text-sm font-semibold text-muted-foreground">
            Loading players…
          </li>
        ) : filtered.length === 0 ? (
          <li className="rounded-xl border-2 border-dashed border-border px-3 py-8 text-center text-sm font-semibold text-muted-foreground">
            No players match this filter.
          </li>
        ) : (
          filtered.map((player) => {
            const rosterTeamId = rosterTeamByPlayerId.get(player.id)
            const rosterTeamName = rosterTeamId
              ? teamNameById.get(rosterTeamId) ?? null
              : null
            return (
              <li key={player.id}>
                <button
                  type="button"
                  onClick={() => setSelectedPlayerId(player.id)}
                  className="flex min-h-14 w-full touch-manipulation items-center gap-3 rounded-xl border-2 border-border bg-background px-3 py-3 text-left transition-transform active:scale-[0.99]"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-neon/40 bg-neon/10 font-display text-lg font-black tabular-nums text-neon">
                    {player.jersey ?? '—'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-sm font-bold uppercase tracking-wide text-foreground">
                      {formatPlayerFullName(player.first_name, player.last_name)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      {player.age_group}
                      {rosterTeamName ? ` · ${rosterTeamName}` : ' · Unassigned'}
                    </span>
                  </span>
                  <ArrowLeft className="size-4 rotate-180 text-muted-foreground" aria-hidden />
                </button>
              </li>
            )
          })
        )}
      </ul>

      <p className={cn('text-xs font-semibold text-muted-foreground')}>
        {filtered.length} player{filtered.length === 1 ? '' : 's'}
        {ageGroup !== 'all' ? ` · ${ageGroup}` : ''}
        {teamId === 'unassigned'
          ? ' · Unassigned'
          : teamId !== 'all'
            ? ` · ${teamNameById.get(teamId) ?? 'Team'}`
            : ''}
      </p>
    </section>
  )
}
