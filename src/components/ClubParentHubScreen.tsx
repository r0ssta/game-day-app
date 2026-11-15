import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Radio, Users } from 'lucide-react'
import { ClubBrandMark } from '@/components/ClubBrandMark'
import { InstallPrompt } from '@/components/InstallPrompt'
import { IosPushReminderBanner } from '@/components/IosPushReminderBanner'
import { Spinner } from '@/components/Spinner'
import { LiveGameFeed } from '@/components/ParentTimelineList'
import { lazyWithChunkReload } from '@/lib/lazy-import'
import { APP_CONTAINER } from '@/lib/layout'
import { formatMatchDisplayDateTime, getMatchSortTimestamp } from '@/lib/match-schedule'
import { isCompletedResultStatus, isLiveMatchStatus } from '@/lib/match-status'
import { formatMatchResultScore } from '@/lib/penalty-kicks'
import { formatPlayerFullName } from '@/lib/player-names'
import {
  buildParentTimelineRows,
  fetchParentLiveEvents,
  isParentHubFinishedMatch,
  type ParentHubMatch,
  type ParentLiveEvent,
} from '@/lib/parent-hub'
import {
  applyParentHubManifestLink,
  applyParentHubPwaHead,
  rememberParentHubSlug,
} from '@/lib/parent-hub-pwa'
import {
  clubTeamDisplayName,
  coachRoleLabel,
  fetchParentClubHub,
  fetchParentClubTeam,
  readClubHubQueryState,
  recordLabel,
  replaceClubHubUrl,
  scoreboardMatchToParentHubMatch,
  type ParentClubHubPayload,
  type ParentClubScoreboardMatch,
  type ParentClubTeamPayload,
} from '@/lib/parent-club-hub'
import {
  formatWeekendLabel,
  isSameWeekend,
  shiftWeekend,
  weekendWindow,
} from '@/lib/saturday-board'
import { cn } from '@/lib/utils'

const ParentFinishedMatchDetail = lazyWithChunkReload(() =>
  import('@/components/ParentFinishedMatchDetail').then((m) => ({
    default: m.ParentFinishedMatchDetail,
  })),
)

type ClubParentHubScreenProps = {
  clubSlug: string
  /** When opening a legacy /hub/:teamSlug that belongs to this club. */
  initialTeamSlug?: string | null
}

type TabId = 'scoreboard' | 'teams'

function isFinishedStatus(status: string): boolean {
  return status === 'final' || status === 'pending_review' || isCompletedResultStatus(status)
}

function statusBadge(status: string): { label: string; className: string } {
  if (isLiveMatchStatus(status)) {
    return { label: 'Live', className: 'bg-neon/20 text-neon' }
  }
  if (isFinishedStatus(status)) {
    return { label: 'Final', className: 'bg-secondary text-muted-foreground' }
  }
  if (status === 'postponed') {
    return { label: 'Postponed', className: 'bg-amber-500/20 text-amber-100' }
  }
  return { label: 'Sched', className: 'bg-secondary text-muted-foreground' }
}

function scheduleFields(match: {
  matchDate: string | null
  matchTime: string | null
  date: string | null
}) {
  return {
    match_date: match.matchDate,
    match_time: match.matchTime,
    date: match.date ?? '',
  }
}

function ScoreboardRow({
  match,
  onOpen,
}: {
  match: ParentClubScoreboardMatch
  onOpen: () => void
}) {
  const when = formatMatchDisplayDateTime(scheduleFields(match))
  const badge = statusBadge(match.status)
  const score = formatMatchResultScore({
    home_score: match.homeScore,
    away_score: match.awayScore,
    home_pk_score: match.homePkScore,
    away_pk_score: match.awayPkScore,
    pk_winner_is_us: match.pkWinnerIsUs,
  })
  const teamLabel = clubTeamDisplayName({ name: match.teamName, ageGroup: match.ageGroup })
  const venue =
    match.locationType === 'away' ? 'Away' : match.locationType === 'home' ? 'Home' : null

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full min-h-14 touch-manipulation items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
              badge.className,
            )}
          >
            {badge.label}
          </span>
          <span className="truncate text-[11px] font-semibold text-muted-foreground">
            {when.dateLabel} · {when.timeLabel}
            {venue ? ` · ${venue}` : ''}
          </span>
        </div>
        <p className="mt-1 truncate font-display text-base font-bold uppercase tracking-wide text-foreground">
          {teamLabel}
        </p>
        <p className="truncate text-sm text-muted-foreground">vs {match.opponent || 'Opponent'}</p>
      </div>
      <span className="shrink-0 font-mono text-lg font-black tabular-nums text-foreground">
        {isLiveMatchStatus(match.status) || isFinishedStatus(match.status) ? score : '—'}
      </span>
    </button>
  )
}

function ClubLiveMatchView({
  match,
  teamLabel,
  onBack,
}: {
  match: ParentHubMatch
  teamLabel: string
  onBack: () => void
}) {
  const [events, setEvents] = useState<ParentLiveEvent[]>([])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      void fetchParentLiveEvents(match.id)
        .then((rows) => {
          if (!cancelled) setEvents(rows)
        })
        .catch(() => undefined)
    }
    load()
    const id = window.setInterval(load, 8_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [match.id])

  const timeline = buildParentTimelineRows(events, {
    totalPeriods: match.total_periods,
  })
  const score = formatMatchResultScore(match)

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl px-1 text-sm font-bold uppercase tracking-wide text-muted-foreground active:scale-95"
      >
        <ArrowLeft className="size-4" />
        Scoreboard
      </button>
      <div className="rounded-xl border border-neon/40 bg-neon/10 px-4 py-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-neon">Live</p>
        <p className="mt-1 font-display text-2xl font-bold uppercase text-foreground">
          {teamLabel} vs {match.opponent || 'Opponent'}
        </p>
        <p className="mt-2 font-mono text-3xl font-black tabular-nums text-foreground">{score}</p>
      </div>
      <LiveGameFeed rows={timeline} teamName={teamLabel} opponent={match.opponent || 'Opponent'} />
    </div>
  )
}

function TeamDetailView({
  detail,
  onBack,
  onOpenMatch,
}: {
  detail: ParentClubTeamPayload
  onBack: () => void
  onOpenMatch: (match: ParentHubMatch) => void
}) {
  const teamLabel = clubTeamDisplayName({ name: detail.teamName, ageGroup: detail.ageGroup })
  const finished = detail.matches.filter((match) => isParentHubFinishedMatch(match.status))

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl px-1 text-sm font-bold uppercase tracking-wide text-muted-foreground active:scale-95"
      >
        <ArrowLeft className="size-4" />
        Teams
      </button>

      <div>
        <h2 className="font-display text-3xl font-bold uppercase tracking-wide text-foreground">
          {teamLabel}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {detail.seasonName ?? 'Season'} · {recordLabel(detail)}
          {detail.matchesPlayed > 0
            ? ` · GF ${detail.goalsFor} GA ${detail.goalsAgainst}`
            : ''}
        </p>
      </div>

      {detail.coaches.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Coaches
          </h3>
          <ul className="space-y-1.5">
            {detail.coaches.map((coach) => (
              <li key={`${coach.role}-${coach.name}`} className="text-sm text-foreground">
                <span className="font-semibold">{coach.name}</span>
                <span className="text-muted-foreground"> · {coachRoleLabel(coach.role)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Roster
        </h3>
        {detail.players.length === 0 ? (
          <p className="text-sm text-muted-foreground">No roster for this season yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {detail.players.map((player) => {
              const name = formatPlayerFullName(player.firstName, player.lastName)
              return (
                <li
                  key={player.id}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-foreground"
                >
                  <span className="w-8 shrink-0 font-mono text-xs font-bold tabular-nums text-muted-foreground">
                    {player.number != null ? `#${player.number}` : '—'}
                  </span>
                  <span className="font-semibold">{name}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Recaps
        </h3>
        {finished.length === 0 ? (
          <p className="text-sm text-muted-foreground">No finished matches yet this season.</p>
        ) : (
          <ul className="space-y-2">
            {finished.map((match) => {
              const when = formatMatchDisplayDateTime(match)
              const score = formatMatchResultScore(match)
              return (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => onOpenMatch(match)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left active:scale-[0.99]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">
                      vs {match.opponent || 'Opponent'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {when.dateLabel} · {when.timeLabel}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-base font-black tabular-nums">
                    {score}
                  </span>
                </button>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

export function ClubParentHubScreen({
  clubSlug,
  initialTeamSlug = null,
}: ClubParentHubScreenProps) {
  const initialQuery = readClubHubQueryState()
  const [tab, setTab] = useState<TabId>(
    initialTeamSlug || initialQuery.teamSlug ? 'teams' : initialQuery.tab,
  )
  const [seasonId, setSeasonId] = useState<string | null>(initialQuery.seasonId)
  const [weekendStart, setWeekendStart] = useState<string | null>(initialQuery.weekendStart)
  const [hub, setHub] = useState<ParentClubHubPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedTeamSlug, setSelectedTeamSlug] = useState<string | null>(
    initialTeamSlug || initialQuery.teamSlug,
  )
  const [teamDetail, setTeamDetail] = useState<ParentClubTeamPayload | null>(null)
  const [teamLoading, setTeamLoading] = useState(false)
  const [selectedMatch, setSelectedMatch] = useState<{
    match: ParentHubMatch
    teamLabel: string
    players: ParentClubTeamPayload['players']
  } | null>(null)

  const currentWeekend = useMemo(() => weekendWindow(new Date()), [])

  const viewingWeekend = useMemo(() => {
    if (hub && (!weekendStart || weekendStart === hub.weekendStart)) {
      return { start: hub.weekendStart, end: hub.weekendEnd }
    }
    if (weekendStart) {
      const start = new Date(`${weekendStart}T12:00:00`)
      const end = new Date(start)
      end.setDate(start.getDate() + 1)
      const y = end.getFullYear()
      const m = String(end.getMonth() + 1).padStart(2, '0')
      const d = String(end.getDate()).padStart(2, '0')
      return { start: weekendStart, end: `${y}-${m}-${d}` }
    }
    return currentWeekend
  }, [hub, weekendStart, currentWeekend])

  const syncUrl = useCallback(
    (next: {
      tab?: TabId
      seasonId?: string | null
      weekendStart?: string | null
      teamSlug?: string | null
      matchId?: string | null
    }) => {
      replaceClubHubUrl(clubSlug, {
        tab: next.tab ?? tab,
        seasonId: next.seasonId === undefined ? seasonId : next.seasonId,
        weekendStart: next.weekendStart === undefined ? weekendStart : next.weekendStart,
        teamSlug: next.teamSlug === undefined ? selectedTeamSlug : next.teamSlug,
        matchId: next.matchId === undefined ? selectedMatch?.match.id ?? null : next.matchId,
        // buildClubHubSearch uses currentWeekend internally via omit-when-default
      })
    },
    [clubSlug, tab, seasonId, weekendStart, selectedTeamSlug, selectedMatch],
  )

  const reloadHub = useCallback(async () => {
    const payload = await fetchParentClubHub({
      clubSlug,
      seasonId,
      weekendStart,
    })
    setHub(payload)
    return payload
  }, [clubSlug, seasonId, weekendStart])

  useEffect(() => {
    rememberParentHubSlug(clubSlug)
    applyParentHubManifestLink(clubSlug)
    return applyParentHubPwaHead({
      slug: clubSlug,
      teamName: hub?.clubName ?? 'Virginia Velocity',
      brandColor: null,
      logoUrl: null,
    })
  }, [clubSlug, hub?.clubName])

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    void reloadHub().catch((err) => {
      if (!cancelled) {
        setLoadError(err instanceof Error ? err.message : 'Could not load club hub')
      }
    })
    return () => {
      cancelled = true
    }
  }, [reloadHub])

  // Soft refresh scoreboard while on that tab
  useEffect(() => {
    if (tab !== 'scoreboard' || selectedMatch || selectedTeamSlug) return
    const id = window.setInterval(() => {
      void reloadHub().catch(() => undefined)
    }, 15_000)
    return () => window.clearInterval(id)
  }, [tab, selectedMatch, selectedTeamSlug, reloadHub])

  useEffect(() => {
    if (!selectedTeamSlug) {
      setTeamDetail(null)
      return
    }
    let cancelled = false
    setTeamLoading(true)
    void fetchParentClubTeam({
      clubSlug,
      teamSlug: selectedTeamSlug,
      seasonId: seasonId ?? hub?.seasonId,
    })
      .then((detail) => {
        if (!cancelled) setTeamDetail(detail)
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load team')
          setSelectedTeamSlug(null)
        }
      })
      .finally(() => {
        if (!cancelled) setTeamLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [clubSlug, selectedTeamSlug, seasonId, hub?.seasonId])

  useEffect(() => {
    syncUrl({
      tab,
      seasonId,
      weekendStart,
      teamSlug: selectedTeamSlug,
      matchId: selectedMatch?.match.id ?? null,
    })
  }, [tab, seasonId, weekendStart, selectedTeamSlug, selectedMatch, syncUrl])

  const goWeekend = (offset: number) => {
    const next = shiftWeekend(viewingWeekend, offset)
    setWeekendStart(isSameWeekend(next, currentWeekend) ? null : next.start)
    setSelectedMatch(null)
  }

  const openScoreboardMatch = (row: ParentClubScoreboardMatch) => {
    const match = scoreboardMatchToParentHubMatch(row)
    const teamLabel = clubTeamDisplayName({ name: row.teamName, ageGroup: row.ageGroup })
    if (isLiveMatchStatus(row.status) || isFinishedStatus(row.status)) {
      setSelectedMatch({ match, teamLabel, players: [] })
      return
    }
    // Scheduled: jump to team page for context
    setTab('teams')
    setSelectedTeamSlug(row.teamSlug)
  }

  const seasons = hub?.seasons ?? []
  const resolvedSeasonId = seasonId ?? hub?.seasonId

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <InstallPrompt teamLabel={hub?.clubName} />

      <header className="border-b border-border bg-background/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className={`${APP_CONTAINER} space-y-3`}>
          <ClubBrandMark size="sm" priority />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-foreground">
                {hub?.clubName ?? 'Virginia Velocity'}
              </h1>
              <p className="text-sm text-muted-foreground">Parent Hub · scores &amp; teams</p>
            </div>
            {seasons.length > 0 ? (
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Season
                </span>
                <select
                  value={resolvedSeasonId ?? ''}
                  onChange={(event) => {
                    const next = event.target.value || null
                    const active = seasons.find((season) => season.status === 'active')
                    setSeasonId(next && next === active?.id ? null : next)
                    setSelectedMatch(null)
                    setTeamDetail(null)
                  }}
                  className="min-h-10 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground"
                >
                  {seasons.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.name}
                      {season.status === 'active' ? ' (active)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <IosPushReminderBanner />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-28">
        <div className={`${APP_CONTAINER} space-y-4`}>
          {loadError ? (
            <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
              {loadError}
            </p>
          ) : !hub ? (
            <p className="text-sm font-semibold text-muted-foreground">Loading club…</p>
          ) : selectedMatch && isParentHubFinishedMatch(selectedMatch.match.status) ? (
            <Suspense fallback={<Spinner />}>
              <ParentFinishedMatchDetail
                match={selectedMatch.match}
                players={selectedMatch.players}
                opponent={selectedMatch.match.opponent}
                teamName={selectedMatch.teamLabel}
                onBack={() => setSelectedMatch(null)}
              />
            </Suspense>
          ) : selectedMatch && isLiveMatchStatus(selectedMatch.match.status) ? (
            <ClubLiveMatchView
              match={selectedMatch.match}
              teamLabel={selectedMatch.teamLabel}
              onBack={() => setSelectedMatch(null)}
            />
          ) : selectedTeamSlug ? (
            teamLoading || !teamDetail ? (
              <p className="text-sm font-semibold text-muted-foreground">Loading team…</p>
            ) : (
              <TeamDetailView
                detail={teamDetail}
                onBack={() => {
                  setSelectedTeamSlug(null)
                  setTeamDetail(null)
                  setTab('teams')
                }}
                onOpenMatch={(match) => {
                  setSelectedMatch({
                    match,
                    teamLabel: clubTeamDisplayName({
                      name: teamDetail.teamName,
                      ageGroup: teamDetail.ageGroup,
                    }),
                    players: teamDetail.players,
                  })
                }}
              />
            )
          ) : tab === 'scoreboard' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goWeekend(-1)}
                  className="flex size-11 items-center justify-center rounded-xl border border-border bg-card text-foreground active:scale-95"
                  aria-label="Previous weekend"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <div className="min-w-0 flex-1 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Weekend
                  </p>
                  <p className="font-display text-lg font-bold uppercase tracking-wide text-foreground">
                    {formatWeekendLabel(viewingWeekend)}
                  </p>
                  {!isSameWeekend(viewingWeekend, currentWeekend) ? (
                    <button
                      type="button"
                      onClick={() => {
                        setWeekendStart(null)
                        setSelectedMatch(null)
                      }}
                      className="mt-1 text-xs font-bold uppercase tracking-wide text-neon"
                    >
                      This weekend
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => goWeekend(1)}
                  className="flex size-11 items-center justify-center rounded-xl border border-border bg-card text-foreground active:scale-95"
                  aria-label="Next weekend"
                >
                  <ChevronRight className="size-5" />
                </button>
              </div>

              {hub.liveNowMatches.length > 0 ? (
                <section className="space-y-2">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-neon">Live now</h2>
                  {hub.liveNowMatches.map((match) => (
                    <ScoreboardRow
                      key={`live-${match.id}`}
                      match={match}
                      onOpen={() => openScoreboardMatch(match)}
                    />
                  ))}
                </section>
              ) : null}

              <section className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Games
                </h2>
                {hub.weekendMatches.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                    No games this weekend for {hub.seasonName ?? 'this season'}.
                  </p>
                ) : (
                  [...hub.weekendMatches]
                    .sort((a, b) => {
                      const aLive = isLiveMatchStatus(a.status) ? 0 : 1
                      const bLive = isLiveMatchStatus(b.status) ? 0 : 1
                      if (aLive !== bLive) return aLive - bLive
                      return (
                        getMatchSortTimestamp(scheduleFields(a)) -
                        getMatchSortTimestamp(scheduleFields(b))
                      )
                    })
                    .map((match) => (
                      <ScoreboardRow
                        key={match.id}
                        match={match}
                        onOpen={() => openScoreboardMatch(match)}
                      />
                    ))
                )}
              </section>
            </div>
          ) : (
            <div className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Teams · {hub.seasonName ?? 'Season'}
              </h2>
              {hub.teams.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                  No active teams yet.
                </p>
              ) : (
                hub.teams.map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => {
                      setSelectedTeamSlug(team.slug)
                      setTab('teams')
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left active:scale-[0.99]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg font-bold uppercase tracking-wide text-foreground">
                        {clubTeamDisplayName(team)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {team.matchesPlayed > 0
                          ? `${recordLabel(team)} · GF ${team.goalsFor} GA ${team.goalsAgainst}`
                          : 'No games yet'}
                      </p>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </main>

      <nav
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur',
          selectedMatch || selectedTeamSlug ? 'hidden' : undefined,
        )}
      >
        <div className={`${APP_CONTAINER} grid grid-cols-2 gap-1`}>
          {(
            [
              { id: 'scoreboard' as const, label: 'Scoreboard', icon: Radio },
              { id: 'teams' as const, label: 'Teams', icon: Users },
            ] as const
          ).map(({ id, label, icon: Icon }) => {
            const active = tab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-bold uppercase tracking-wide active:scale-95',
                  active ? 'bg-neon/15 text-neon' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-5" strokeWidth={2.25} />
                {label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
