import { useMemo } from 'react'
import { buildGoalScoreboard, type ScoreboardGoal } from '@/lib/goal-scoreboard'
import type { ParentHubPlayer, ParentLiveEvent } from '@/lib/parent-hub'
import { cn } from '@/lib/utils'

function GoalLine({ goal }: { goal: ScoreboardGoal }) {
  const who = goal.ownGoal ? 'Own goal' : goal.scorer
  const notes: string[] = []
  if (goal.assist && !goal.ownGoal && !goal.penalty) notes.push(goal.assist)
  if (goal.penalty) notes.push('PK')

  return (
    <p className="text-xs font-semibold leading-snug text-foreground">
      {who ? <span>{who} </span> : null}
      <span className="font-mono tabular-nums">{goal.minute}</span>
      {notes.length > 0 ? (
        <span className="font-medium text-muted-foreground"> ({notes.join(', ')})</span>
      ) : null}
    </p>
  )
}

function GoalColumn({
  team,
  goals,
  align,
}: {
  team: string
  goals: ScoreboardGoal[]
  align: 'start' | 'end'
}) {
  if (goals.length === 0) return <div aria-hidden="true" />

  return (
    <div className={cn('min-w-0', align === 'end' && 'text-right')}>
      <p
        className={cn(
          'truncate text-[10px] font-bold uppercase tracking-widest',
          align === 'end' ? 'text-muted-foreground' : 'text-neon',
        )}
      >
        {team}
      </p>
      <ol className="mt-1 list-none space-y-0.5 p-0">
        {goals.map((goal) => (
          <li key={goal.id}>
            <GoalLine goal={goal} />
          </li>
        ))}
      </ol>
    </div>
  )
}

export function GoalScoreboard({
  events,
  players,
  periodLengthMinutes,
  totalPeriods,
  teamName,
  opponent,
}: {
  events: ParentLiveEvent[]
  players: ParentHubPlayer[]
  periodLengthMinutes: number
  totalPeriods?: number | null
  teamName: string
  opponent: string
}) {
  const board = useMemo(
    () =>
      buildGoalScoreboard(events, {
        periodLengthMinutes,
        totalPeriods,
        players,
      }),
    [events, periodLengthMinutes, players, totalPeriods],
  )

  if (board.us.length === 0 && board.them.length === 0) return null

  return (
    <div className="mt-3 grid w-full grid-cols-2 gap-x-4 text-left" aria-label="Goal scorers">
      <GoalColumn team={teamName.trim() || 'Us'} goals={board.us} align="start" />
      <GoalColumn team={opponent.trim() || 'Opponent'} goals={board.them} align="end" />
    </div>
  )
}
