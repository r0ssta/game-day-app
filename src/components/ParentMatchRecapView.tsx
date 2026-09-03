import { useMemo } from 'react'
import { formatMatchResultScore } from '@/lib/penalty-kicks'
import { buildParentTeamBoxScore } from '@/lib/parent-box-score'
import { formatRecapMinutes } from '@/lib/match-recap'
import {
  buildParentTimelineRows,
  type ParentHubPlayer,
  type ParentLiveEvent,
} from '@/lib/parent-hub'
import {
  buildParentMatchPlayerStats,
  formatParentCountingStats,
  formatParentHalfRole,
  formatParentPositionsLine,
  formatParentTotalRole,
  type ParentHalfStat,
  type ParentMatchPlayerStat,
} from '@/lib/parent-match-stats'
import { ParentTeamBoxScore } from '@/components/ParentTeamBoxScore'
import { ParentTimelineList } from '@/components/ParentTimelineList'
import { cn } from '@/lib/utils'

function formatJersey(number: number | null): string {
  return number != null ? String(number) : '—'
}

function HalfColumn({
  label,
  half,
  role,
}: {
  label: string
  half: ParentHalfStat
  role: string
}) {
  const counting = formatParentCountingStats(half)
  return (
    <div className="min-w-0 px-2 py-2 first:pl-0 last:pr-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-sm font-bold tabular-nums text-neon">
        {formatRecapMinutes(half.seconds)}
      </p>
      <p className="mt-0.5 text-[11px] font-semibold text-foreground">{role}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
        {formatParentPositionsLine(half.positions)}
      </p>
      {counting ? (
        <p className="mt-1 text-[11px] font-semibold text-foreground">{counting}</p>
      ) : null}
    </div>
  )
}

function PlayerStatCard({ row }: { row: ParentMatchPlayerStat }) {
  return (
    <li className="px-3 py-3.5">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-border',
            'font-display text-lg font-bold tabular-nums text-foreground',
          )}
        >
          {formatJersey(row.jersey)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-foreground">{row.name}</p>
          <p className="font-mono text-xs font-bold tabular-nums text-muted-foreground">
            {formatRecapMinutes(row.total.seconds)} total
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 divide-x divide-border border-t border-border pt-1">
        <HalfColumn label="1st half" half={row.halves[0]} role={formatParentHalfRole(row.halves[0])} />
        <HalfColumn label="2nd half" half={row.halves[1]} role={formatParentHalfRole(row.halves[1])} />
        <HalfColumn label="Total" half={row.total} role={formatParentTotalRole(row)} />
      </div>
      {row.extraHalves.some((half) => half.seconds > 0 || half.started) ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {row.extraHalves
            .map((half, index) =>
              half.seconds > 0 || half.started
                ? `${index + 3}rd · ${formatRecapMinutes(half.seconds)} · ${formatParentHalfRole(half)}`
                : null,
            )
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}
    </li>
  )
}

export type ParentMatchRecapViewProps = {
  events: ParentLiveEvent[]
  players: ParentHubPlayer[]
  matchId: string
  halfLengthMinutes: number
  totalPeriods?: number | null
  opponent: string
  teamName: string
  homeScore: number
  awayScore: number
  homePkScore?: number
  awayPkScore?: number
  pkWinnerIsUs?: boolean | null
  dateLabel?: string
  timeLabel?: string
  recap?: string
  heading?: string
}

export function ParentMatchRecapView({
  events,
  players,
  matchId,
  halfLengthMinutes,
  totalPeriods,
  opponent,
  teamName,
  homeScore,
  awayScore,
  homePkScore = 0,
  awayPkScore = 0,
  pkWinnerIsUs = null,
  dateLabel,
  timeLabel,
  recap = '',
  heading = 'Final',
}: ParentMatchRecapViewProps) {
  const playerStats = useMemo(
    () => buildParentMatchPlayerStats(events, matchId, halfLengthMinutes, players),
    [events, halfLengthMinutes, matchId, players],
  )
  const timeline = useMemo(
    () => buildParentTimelineRows(events, { totalPeriods }),
    [events, totalPeriods],
  )
  const teamBoxScore = useMemo(
    () =>
      buildParentTeamBoxScore(events, {
        halfLengthMinutes,
        totalPeriods,
      }),
    [events, halfLengthMinutes, totalPeriods],
  )
  const score = formatMatchResultScore({
    home_score: homeScore,
    away_score: awayScore,
    home_pk_score: homePkScore,
    away_pk_score: awayPkScore,
    pk_winner_is_us: pkWinnerIsUs,
  })
  const when =
    dateLabel || timeLabel
      ? [dateLabel, timeLabel].filter(Boolean).join(' · ')
      : null

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card px-4 py-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {heading}
        </p>
        <p className="mt-1 font-display text-2xl font-bold uppercase text-foreground">
          vs {opponent || 'Opponent'}
        </p>
        {when ? (
          <p className="mt-1 text-sm font-semibold text-muted-foreground">{when}</p>
        ) : null}
        <p className="mt-3 font-mono text-3xl font-black tabular-nums text-foreground">{score}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Overall
        </p>
        <ParentTeamBoxScore model={teamBoxScore} teamName={teamName} opponent={opponent} />
      </div>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Player stats
        </h2>
        {playerStats.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            No player minutes recorded for this match.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {playerStats.map((row) => (
              <PlayerStatCard key={row.playerId} row={row} />
            ))}
          </ul>
        )}
      </section>

      {recap.trim() ? (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Coach recap
          </h2>
          <div className="rounded-xl border border-border bg-card px-4 py-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {recap.trim()}
            </p>
          </div>
        </section>
      ) : null}

      {timeline.length > 0 ? (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Timeline
          </h2>
          <ParentTimelineList rows={timeline} opponent={opponent} teamName={teamName} />
        </section>
      ) : null}
    </div>
  )
}

export function RecapPerspectiveTabs({
  value,
  onChange,
}: {
  value: 'coach' | 'hub'
  onChange: (value: 'coach' | 'hub') => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Recap view"
      className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1"
    >
      {(
        [
          { id: 'coach', label: 'Coach review' },
          { id: 'hub', label: 'Parent Hub' },
        ] as const
      ).map((tab) => {
        const active = value === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex min-h-11 touch-manipulation items-center justify-center rounded-lg px-2 py-2 text-xs font-bold uppercase tracking-wide active:scale-[0.98]',
              active ? 'bg-neon text-neon-foreground' : 'bg-secondary text-muted-foreground',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
