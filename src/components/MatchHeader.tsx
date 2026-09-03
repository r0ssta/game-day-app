import { Goal, Loader2, Lock, Share2, Shield, SquareAsterisk } from 'lucide-react'
import { BackToHomeButton } from '@/components/AppNavigation'
import { cn } from '@/lib/utils'
import {
  formatClock,
  formatMatchClockParts,
  halfDurationSeconds,
  isHalfExpired,
  isInAddedTime,
} from '@/lib/match-clock'
import { formatPeriodLong, formatPeriodShort } from '@/lib/match-periods'
import { APP_CONTAINER } from '@/lib/layout'
import type { MatchPeriod, TotalPeriods } from '@/types/match'

export type MatchHeaderProps = {
  teamName: string
  coachName: string
  opponent: string
  homeScore: number
  awayScore: number
  homeShots?: number
  awayShots?: number
  homeSaves?: number
  awaySaves?: number
  homeCorners?: number
  awayCorners?: number
  seconds: number
  period: MatchPeriod
  currentPeriod: number
  totalPeriods: TotalPeriods
  halfLengthMinutes: number
  running: boolean
  periodClockStarted: boolean
  /** Staff test match — parents do not see this game. */
  isTest?: boolean
  /** True when Screen Wake Lock is held (keeps display on). */
  wakeLockActive?: boolean
  /** When true, header is already outside the scrollport — no sticky needed. */
  pinned?: boolean
  onHome: () => void
  onLogGoal?: () => void
  onOpponentGoal?: () => void
  onRemoveGoal?: (side: 'home' | 'away') => void
  onLogShot?: (side: 'home' | 'away') => void
  onLogSave?: (side: 'home' | 'away') => void
  onLogCorner?: (side: 'home' | 'away') => void
  onLogCard?: () => void
  onShareStatTracker?: () => void
  /** True while a live-event mutation is still syncing to the match API. */
  syncPending?: boolean
}

export function MatchHeader({
  teamName,
  coachName,
  opponent,
  homeScore,
  awayScore,
  homeShots = 0,
  awayShots = 0,
  homeSaves = 0,
  awaySaves = 0,
  homeCorners = 0,
  awayCorners = 0,
  seconds,
  period: _period,
  currentPeriod,
  totalPeriods,
  halfLengthMinutes,
  running,
  periodClockStarted,
  isTest = false,
  wakeLockActive = false,
  pinned = false,
  onHome,
  onLogGoal,
  onOpponentGoal,
  onRemoveGoal,
  onLogShot,
  onLogSave,
  onLogCorner,
  onLogCard,
  onShareStatTracker,
  syncPending = false,
}: MatchHeaderProps) {
  const homeLabel = teamName.trim() || 'Home'
  const awayName = opponent.trim() || 'Opponent'
  const halfReference = formatClock(halfDurationSeconds(halfLengthMinutes))
  const coachLine = coachName.trim() ? `Coach: ${coachName.trim()}` : null
  const regulationElapsed = periodClockStarted && isHalfExpired(seconds)
  const inAddedTime = periodClockStarted && isInAddedTime(seconds)
  const waitingToStart = !periodClockStarted
  const clockParts = formatMatchClockParts(seconds)
  const showGoalActions = Boolean(periodClockStarted && onLogGoal && onOpponentGoal)
  const showShotSaveActions = Boolean(
    periodClockStarted && onLogShot && onLogSave && onLogCorner,
  )
  const showTeamShotSaveLine =
    homeShots + awayShots + homeSaves + awaySaves + homeCorners + awayCorners > 0 ||
    showShotSaveActions
  const periodBadge = formatPeriodShort(currentPeriod, totalPeriods)
  const periodReadyLabel = formatPeriodLong(currentPeriod, totalPeriods)

  return (
    <header
      className={cn(
        'z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        pinned ? 'relative' : 'sticky top-0',
      )}
    >
      <div className={`${APP_CONTAINER} space-y-2 py-2`}>
        {isTest ? (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-amber-200">
            Testing match — hidden from parents
          </p>
        ) : null}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-center text-xs font-bold text-foreground sm:text-sm">
              <span>{homeLabel}</span>
              <span className="mx-1 text-muted-foreground">vs</span>
              <span>{awayName}</span>
            </p>
            {coachLine ? (
              <p className="truncate text-center text-[10px] font-semibold text-muted-foreground">
                {coachLine}
              </p>
            ) : null}
          </div>
          <BackToHomeButton onClick={onHome} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[9px] font-bold uppercase tracking-widest text-neon">
              {homeLabel}
            </p>
            <p className="font-display text-3xl font-black tabular-nums leading-none text-neon">
              {homeScore}
            </p>
            {showGoalActions && onRemoveGoal && homeScore > 0 ? (
              <button
                type="button"
                onClick={() => onRemoveGoal('home')}
                className="mt-1 min-h-8 touch-manipulation rounded-lg border border-neon/30 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-neon active:scale-[0.98]"
              >
                Undo goal
              </button>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <div className="flex items-center gap-1.5">
              {running ? (
                <span className="size-1.5 animate-pulse rounded-full bg-neon" />
              ) : null}
              {inAddedTime ? (
                <span className="rounded bg-athletic px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                  +Time
                </span>
              ) : regulationElapsed ? (
                <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                  Reg
                </span>
              ) : null}
              <span
                className={cn(
                  'font-display text-2xl font-bold tabular-nums tracking-wider sm:text-3xl',
                  inAddedTime
                    ? 'text-athletic'
                    : waitingToStart
                      ? 'text-muted-foreground'
                      : 'text-neon',
                )}
              >
                {clockParts.regulation}
              </span>
              {clockParts.addedLabel ? (
                <span className="font-display text-lg font-black tabular-nums text-athletic">
                  {clockParts.addedLabel}
                </span>
              ) : null}
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {periodBadge}
              </span>
              {wakeLockActive ? (
                <span
                  className="inline-flex items-center text-muted-foreground"
                  title="Screen stay-awake is on"
                  aria-label="Screen stay-awake is on"
                >
                  <Lock className="size-3.5" strokeWidth={2.5} aria-hidden />
                </span>
              ) : null}
              {syncPending ? (
                <span
                  className="inline-flex items-center gap-1 text-muted-foreground"
                  title="Saving match event…"
                  aria-label="Saving match event"
                >
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  <span className="size-1.5 rounded-full bg-athletic" aria-hidden />
                </span>
              ) : null}
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              {waitingToStart
                ? `Ready · ${periodReadyLabel} · ${halfReference}`
                : inAddedTime
                  ? 'Added time'
                  : regulationElapsed
                    ? 'Regulation done'
                    : `${halfReference} period`}
            </span>
          </div>

          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              {awayName}
            </p>
            <p className="font-display text-3xl font-black tabular-nums leading-none text-foreground">
              {awayScore}
            </p>
            {showGoalActions && onRemoveGoal && awayScore > 0 ? (
              <button
                type="button"
                onClick={() => onRemoveGoal('away')}
                className="mt-1 min-h-8 touch-manipulation rounded-lg border border-border px-2 py-1 text-[10px] font-black uppercase tracking-wide text-muted-foreground active:scale-[0.98]"
              >
                Undo goal
              </button>
            ) : null}
          </div>
        </div>

        {showTeamShotSaveLine ? (
          <p className="text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Shots {homeShots}–{awayShots}
            <span className="mx-1.5 text-border">·</span>
            Saves {homeSaves}–{awaySaves}
            <span className="mx-1.5 text-border">·</span>
            Corners {homeCorners}–{awayCorners}
          </p>
        ) : null}

        {showGoalActions ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={onLogGoal}
                  className="flex min-h-11 w-full touch-manipulation items-center justify-center gap-1.5 rounded-xl bg-neon px-2 py-2.5 font-display text-sm font-black uppercase tracking-wide text-neon-foreground shadow-md shadow-neon/25 active:scale-[0.98]"
                >
                  <Goal className="size-4" strokeWidth={2.5} />
                  Goal
                </button>
                {showShotSaveActions ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onLogShot?.('home')}
                      className="flex min-h-10 touch-manipulation items-center justify-center rounded-lg border border-border bg-card px-1 py-2 text-[10px] font-black uppercase tracking-wide text-foreground active:scale-[0.98]"
                    >
                      + Shot
                    </button>
                    <button
                      type="button"
                      onClick={() => onLogSave?.('home')}
                      className="flex min-h-10 touch-manipulation items-center justify-center rounded-lg border border-border bg-card px-1 py-2 text-[10px] font-black uppercase tracking-wide text-foreground active:scale-[0.98]"
                    >
                      + Save
                    </button>
                    <button
                      type="button"
                      onClick={() => onLogCorner?.('home')}
                      className="flex min-h-10 touch-manipulation items-center justify-center rounded-lg border border-border bg-card px-1 py-2 text-[10px] font-black uppercase tracking-wide text-foreground active:scale-[0.98]"
                    >
                      + Corner
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={onOpponentGoal}
                  className="flex min-h-11 w-full touch-manipulation items-center justify-center gap-1.5 rounded-xl border-2 border-border bg-secondary px-2 py-2.5 font-display text-sm font-black uppercase tracking-wide text-muted-foreground active:scale-[0.98]"
                >
                  <Shield className="size-4" strokeWidth={2.5} />
                  Opp. Goal
                </button>
                {showShotSaveActions ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onLogShot?.('away')}
                      className="flex min-h-10 touch-manipulation items-center justify-center rounded-lg border border-border bg-card px-1 py-2 text-[10px] font-black uppercase tracking-wide text-foreground active:scale-[0.98]"
                    >
                      + Shot
                    </button>
                    <button
                      type="button"
                      onClick={() => onLogSave?.('away')}
                      className="flex min-h-10 touch-manipulation items-center justify-center rounded-lg border border-border bg-card px-1 py-2 text-[10px] font-black uppercase tracking-wide text-foreground active:scale-[0.98]"
                    >
                      + Save
                    </button>
                    <button
                      type="button"
                      onClick={() => onLogCorner?.('away')}
                      className="flex min-h-10 touch-manipulation items-center justify-center rounded-lg border border-border bg-card px-1 py-2 text-[10px] font-black uppercase tracking-wide text-foreground active:scale-[0.98]"
                    >
                      + Corner
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            {onLogCard ? (
              <button
                type="button"
                onClick={onLogCard}
                className="flex min-h-11 w-full touch-manipulation items-center justify-center gap-1.5 rounded-xl border-2 border-amber-400/50 bg-amber-400/10 px-2 py-2.5 font-display text-sm font-black uppercase tracking-wide text-amber-700 active:scale-[0.98]"
              >
                <SquareAsterisk className="size-4" strokeWidth={2.5} />
                Log Card
              </button>
            ) : null}
          </div>
        ) : null}

        {onShareStatTracker ? (
          <button
            type="button"
            onClick={onShareStatTracker}
            className="flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-athletic/40 bg-athletic/10 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-athletic active:scale-[0.98]"
          >
            <Share2 className="size-4" strokeWidth={2.5} />
            Share Stat Tracker
          </button>
        ) : null}
      </div>
    </header>
  )
}
