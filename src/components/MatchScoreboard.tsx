import { useMemo } from 'react'
import { buildMatchScoreboardGoals, type ScoreboardScorer } from '@/lib/match-scoreboard'
import type { ParentLiveEvent } from '@/lib/parent-hub'
import { cn } from '@/lib/utils'

function scoreClass(score: number, other: number, tone: 'us' | 'them'): string {
  const behind = score < other
  return cn(
    'font-display tabular-nums leading-none',
    behind ? 'text-4xl font-bold' : 'text-5xl font-black',
    tone === 'us' ? 'text-neon' : behind ? 'text-muted-foreground' : 'text-foreground',
  )
}

function sameTeamLabel(name: string, teamName: string): boolean {
  return name.trim().toLowerCase() === teamName.trim().toLowerCase()
}

function ScorerColumn({
  scorers,
  teamName,
  align,
  label,
}: {
  scorers: ScoreboardScorer[]
  teamName: string
  align: 'start' | 'end'
  label: string
}) {
  if (scorers.length === 0) return null
  return (
    <ul
      className={cn('w-full space-y-1', align === 'end' ? 'text-right' : 'text-left')}
      aria-label={label}
    >
      {scorers.flatMap((scorer) => {
        if (sameTeamLabel(scorer.name, teamName)) {
          return scorer.marks.map((mark, index) => (
            <li
              key={`${scorer.key}:${index}`}
              className="text-xs leading-snug text-muted-foreground"
            >
              {mark}
            </li>
          ))
        }
        return [
          <li key={scorer.key} className="text-xs leading-snug text-foreground">
            <span className="block font-semibold">{scorer.name}</span>
            <span className="text-muted-foreground">{scorer.marks.join(', ')}</span>
          </li>,
        ]
      })}
    </ul>
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
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 px-3 py-4">
        <p
          className="line-clamp-3 text-right text-sm font-bold uppercase leading-tight tracking-wide text-foreground"
          title={usName}
        >
          {usName}
        </p>
        <span />
        <p
          className="line-clamp-3 text-left text-sm font-bold uppercase leading-tight tracking-wide text-foreground"
          title={themName}
        >
          {themName}
        </p>

        <p className={cn(scoreClass(homeScore, awayScore, 'us'), 'justify-self-end self-center')}>
          {homeScore}
        </p>
        <span className="flex min-w-8 flex-col items-center self-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            FT
          </span>
          {pkLabel ? (
            <span className="mt-0.5 text-center text-[10px] font-bold tabular-nums text-muted-foreground">
              {pkLabel}
            </span>
          ) : null}
        </span>
        <p className={cn(scoreClass(awayScore, homeScore, 'them'), 'justify-self-start self-center')}>
          {awayScore}
        </p>

        {hasScorers ? (
          <>
            <div className="min-w-0">
              <ScorerColumn
                scorers={goals.us}
                teamName={usName}
                align="end"
                label={`${usName} goals`}
              />
            </div>
            <span />
            <div className="min-w-0">
              <ScorerColumn
                scorers={goals.them}
                teamName={themName}
                align="start"
                label={`${themName} goals`}
              />
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
