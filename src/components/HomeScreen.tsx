import { type ReactNode } from 'react'
import { BarChart3, ClipboardList, FileText, Play, Users } from 'lucide-react'
import { TeamSelector } from '@/components/AppNavigation'
import { ClubBrandMark } from '@/components/ClubBrandMark'
import { GameRecapNeededAlerts } from '@/components/reporting/GameRecapNeededAlerts'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import { formatMatchDisplayDateTime } from '@/lib/match-schedule'
import type { DbMatch } from '@/types/database'

type NamedEntity = { id: string; name: string }

type HomeScreenProps = {
  teams: NamedEntity[]
  activeTeamId: string | null
  onTeamChange: (teamId: string) => void
  hasActiveMatch: boolean
  activeMatchLabel?: string
  hasPendingRecap: boolean
  pendingRecapLabel?: string
  onCompleteMatchRecap: () => void
  pendingReviewMatches: DbMatch[]
  onOpenPendingReview: (matchId: string) => void
  scheduledMatches: DbMatch[]
  scheduledLoading?: boolean
  onScheduleNewGame: () => void
  onStartLiveMatch: (matchId: string) => void
  startingLiveMatchId?: string | null
  onTeamManagement: () => void
  onReporting: () => void
  onViewRecaps: () => void
  onResumeMatch: () => void
}

export function HomeScreen({
  teams,
  activeTeamId,
  onTeamChange,
  hasActiveMatch,
  activeMatchLabel,
  hasPendingRecap,
  pendingRecapLabel,
  onCompleteMatchRecap,
  pendingReviewMatches,
  onOpenPendingReview,
  scheduledMatches,
  scheduledLoading,
  onScheduleNewGame,
  onStartLiveMatch,
  startingLiveMatchId,
  onTeamManagement,
  onReporting,
  onViewRecaps,
  onResumeMatch,
}: HomeScreenProps) {
  const teamReady = Boolean(activeTeamId)

  return (
    <main className={APP_SHELL}>
      <div className={`${APP_CONTAINER} flex min-h-full flex-col pb-10 pt-8 md:pb-12 md:pt-10`}>
        <header className="mb-6 flex flex-col items-center gap-2 text-center">
          <h1 className="sr-only">Home</h1>
          <ClubBrandMark size="lg" align="center" />
        </header>

        <TeamSelector
          prominent
          teams={teams}
          activeTeamId={activeTeamId}
          onTeamChange={onTeamChange}
        />

        <div className="mt-6 flex flex-1 flex-col justify-center gap-4">
          {hasPendingRecap ? (
            <button
              type="button"
              onClick={onCompleteMatchRecap}
              className="w-full rounded-2xl border-2 border-athletic bg-athletic/10 px-6 py-5 text-left shadow-lg shadow-athletic/10 active:scale-[0.98]"
            >
              <span className="font-display text-lg font-black uppercase tracking-wide text-athletic">
                Complete Match Recap
              </span>
              {pendingRecapLabel ? (
                <span className="mt-1 block text-sm font-semibold text-foreground">
                  {pendingRecapLabel}
                </span>
              ) : null}
              <span className="mt-2 block text-xs text-muted-foreground">
                Finalize player ratings and coach notes for this match.
              </span>
            </button>
          ) : null}

          <GameRecapNeededAlerts
            matches={pendingReviewMatches}
            onOpenRecap={onOpenPendingReview}
          />

          {hasActiveMatch && (
            <button
              type="button"
              onClick={onResumeMatch}
              className="w-full rounded-2xl border-2 border-neon bg-neon/10 px-6 py-5 text-left shadow-lg shadow-neon/10 active:scale-[0.98]"
            >
              <span className="font-display text-lg font-black uppercase tracking-wide text-neon">
                Resume Live Match
              </span>
              {activeMatchLabel ? (
                <span className="mt-1 block text-sm font-semibold text-foreground">
                  {activeMatchLabel}
                </span>
              ) : null}
            </button>
          )}

          <section className="rounded-2xl border border-border bg-card px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Scheduled
              </h2>
              {scheduledLoading ? (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Loading…
                </span>
              ) : null}
            </div>
            {scheduledMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No upcoming games yet. Preload a match to lock in opponent, time, and lineup.
              </p>
            ) : (
              <ul className="space-y-3">
                {scheduledMatches.map((match) => {
                  const when = formatMatchDisplayDateTime(match)
                  const busy = startingLiveMatchId === match.id
                  return (
                    <li
                      key={match.id}
                      className="rounded-xl border border-border bg-background px-3 py-3"
                    >
                      <p className="font-display text-lg font-bold uppercase text-foreground">
                        vs {match.opponent || 'Opponent'}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                        {when.dateLabel} · {when.timeLabel}
                        {match.location_type === 'home' || match.location_type === 'away'
                          ? ` · ${match.location_type === 'home' ? 'Home' : 'Away'}`
                          : ''}
                      </p>
                      <button
                        type="button"
                        disabled={hasActiveMatch || busy}
                        onClick={() => onStartLiveMatch(match.id)}
                        className="mt-3 flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-neon px-3 py-2.5 text-sm font-black uppercase tracking-wide text-neon-foreground disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Play className="size-4" aria-hidden />
                        {busy ? 'Starting…' : 'Start Live Match'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <HomeActionButton
            icon={<ClipboardList className="size-7" strokeWidth={2.5} />}
            title="Schedule New Game"
            description="Preload opponent, kickoff, and starting lineup"
            variant="primary"
            disabled={!teamReady || hasActiveMatch}
            onClick={onScheduleNewGame}
          />

          <HomeActionButton
            icon={<Users className="size-7 text-athletic" strokeWidth={2.5} />}
            title="Team Management"
            description="Roster and preset lineups"
            disabled={!teamReady}
            onClick={onTeamManagement}
          />

          <HomeActionButton
            icon={<FileText className="size-7 text-athletic" strokeWidth={2.5} />}
            title="View Recaps"
            description="Open any finished match recap for review or edits"
            disabled={!teamReady}
            onClick={onViewRecaps}
          />

          <HomeActionButton
            icon={<BarChart3 className="size-7 text-athletic" strokeWidth={2.5} />}
            title="Reporting"
            description="Match history, recaps, and season insights"
            disabled={!teamReady}
            onClick={onReporting}
          />

          {!teamReady && (
            <p className="text-center text-xs text-muted-foreground">
              Select or add a team above to unlock app features.
            </p>
          )}
        </div>
      </div>
    </main>
  )
}

function HomeActionButton({
  icon,
  title,
  description,
  variant = 'default',
  disabled,
  onClick,
}: {
  icon: ReactNode
  title: string
  description: string
  variant?: 'primary' | 'default'
  disabled?: boolean
  onClick: () => void
}) {
  const isPrimary = variant === 'primary'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        isPrimary
          ? 'flex w-full items-center gap-4 rounded-2xl bg-neon px-6 py-6 text-neon-foreground shadow-lg shadow-neon/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40'
          : 'flex w-full items-center gap-4 rounded-2xl border border-border bg-card px-6 py-6 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40'
      }
    >
      <span
        className={
          isPrimary
            ? 'flex size-14 shrink-0 items-center justify-center rounded-xl bg-neon-foreground/15'
            : 'flex size-14 shrink-0 items-center justify-center rounded-xl bg-athletic/15'
        }
      >
        {icon}
      </span>
      <span className="text-left">
        <span
          className={
            isPrimary
              ? 'block font-display text-2xl font-black uppercase tracking-wide'
              : 'block font-display text-2xl font-black uppercase tracking-wide text-foreground'
          }
        >
          {title}
        </span>
        <span
          className={
            isPrimary
              ? 'mt-1 block text-sm font-semibold text-neon-foreground/80'
              : 'mt-1 block text-sm text-muted-foreground'
          }
        >
          {description}
        </span>
      </span>
    </button>
  )
}
