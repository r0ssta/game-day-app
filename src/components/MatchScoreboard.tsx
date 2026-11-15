import { useMemo } from 'react'
import { buildMatchScoreboardGoals, type ScoreboardScorer } from '@/lib/match-scoreboard'
import type { ParentLiveEvent } from '@/lib/parent-hub'
import { cn } from '@/lib/utils'

function SoccerBallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 8.2 14.2 9.7l-.8 2.5h-2.8l-.8-2.5L12 8.2Z"
        fill="currentColor"
      />
      <path
        d="M12 8.2 9.4 7.2M12 8.2 14.6 7.2M10.6 12.2 8.4 13.6M13.4 12.2 15.6 13.6M11.2 14.6 12 16.8 12.8 14.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  )
}

function scoreClass(score: number, other: number, tone: 'us' | 'them'): string {
  const behind = score < other
  return cn(
    'font-display tabular-nums leading-none',
    behind ? 'text-4xl font-bold' : 'text-5xl font-black',
    tone === 'us' ? 'text-neon' : behind ? 'text-muted-foreground' : 'text-foreground',
  )
}

function ScorerList({
  scorers,
  label,
}: {
  scorers: ScoreboardScorer[]
  label: string
}) {
  if (scorers.length === 0) return null
  return (
    <div className="flex gap-2">
      <SoccerBallIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <ul className="flex min-w-0 flex-wrap gap-x-3 gap-y-1" aria-label={label}>
        {scorers.map((scorer) => (
          <li key={scorer.key} className="text-sm leading-snug text-foreground">
            <span className="font-semibold">{scorer.name}</span>
            <span className="text-muted-foreground"> - {scorer.marks.join(', ')}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export type MatchScoreboardProps = {
  teamName: string
  opponent: string
  homeScore: number
  awayScore: number
  homePkScore?: number
  awayPkScore?: number
  pkWinnerIsUs?: boolean | null
  events: ParentLiveEvent[]
  totalPeriods?: number | null
  /** Date or other context shown above the score. */
  meta?: string | null
  /** Draw the card chrome. Turn off when a parent card already frames it. */
  framed?: boolean
}

export function MatchScoreboard({
  teamName,
  opponent,
  homeScore,
  awayScore,
  homePkScore = 0,
  awayPkScore = 0,
  pkWinnerIsUs = null,
  events,
  totalPeriods,
  meta,
  framed = true,
}: MatchScoreboardProps) {
  const usName = teamName.trim() || 'Home'
  const themName = opponent.trim() || 'Opponent'
  const goals = useMemo(
    () =>
      buildMatchScoreboardGoals(events, {
        teamName: usName,
        opponent: themName,
        totalPeriods,
      }),
    [events, themName, totalPeriods, usName],
  )
  const pkLabel =
    pkWinnerIsUs == null ? null : `${pkWinnerIsUs ? 'W' : 'L'} ${homePkScore}–${awayPkScore} PK`
  const hasScorers = goals.us.length > 0 || goals.them.length > 0

  return (
    <section
      className={cn('text-left', framed && 'overflow-hidden rounded-xl border border-border bg-card')}
      aria-label={`Final score ${usName} ${homeScore}, ${themName} ${awayScore}`}
    >
      {meta ? (
        <p className="px-3 pt-3 text-center text-xs font-semibold text-muted-foreground">{meta}</p>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 px-3 py-4">
        <p className="truncate text-right text-sm font-bold uppercase tracking-wide text-foreground">
          {usName}
        </p>
        <div className="flex items-center gap-2.5">
          <span className={scoreClass(homeScore, awayScore, 'us')}>{homeScore}</span>
          <span className="flex min-w-8 flex-col items-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              FT
            </span>
            {pkLabel ? (
              <span className="mt-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                {pkLabel}
              </span>
            ) : null}
          </span>
          <span className={scoreClass(awayScore, homeScore, 'them')}>{awayScore}</span>
        </div>
        <p className="truncate text-left text-sm font-bold uppercase tracking-wide text-foreground">
          {themName}
        </p>
      </div>
      {hasScorers ? (
        <div className="space-y-2 border-t border-border px-3 py-3">
          <ScorerList scorers={goals.us} label={`${usName} goals`} />
          <ScorerList scorers={goals.them} label={`${themName} goals`} />
        </div>
      ) : null}
    </section>
  )
}
