import type { ReactNode } from 'react'
import { BarChart3, ClipboardList, Users } from 'lucide-react'
import { TeamSelector } from '@/components/AppNavigation'
import { GameRecapNeededAlerts } from '@/components/reporting/GameRecapNeededAlerts'
import type { DbMatch } from '@/types/database'

type NamedEntity = { id: string; name: string }

type HomeScreenProps = {
  teams: NamedEntity[]
  activeTeamId: string | null
  onTeamChange: (teamId: string) => void
  onAddTeam: (name: string) => Promise<string | void>
  hasActiveMatch: boolean
  activeMatchLabel?: string
  hasPendingRecap: boolean
  pendingRecapLabel?: string
  onCompleteMatchRecap: () => void
  pendingReviewMatches: DbMatch[]
  onOpenPendingReview: (matchId: string) => void
  onNewGame: () => void
  onTeamManagement: () => void
  onReporting: () => void
  onResumeMatch: () => void
}

export function HomeScreen({
  teams,
  activeTeamId,
  onTeamChange,
  onAddTeam,
  hasActiveMatch,
  activeMatchLabel,
  hasPendingRecap,
  pendingRecapLabel,
  onCompleteMatchRecap,
  pendingReviewMatches,
  onOpenPendingReview,
  onNewGame,
  onTeamManagement,
  onReporting,
  onResumeMatch,
}: HomeScreenProps) {
  const teamReady = Boolean(activeTeamId)

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-10 pt-8">
        <header className="mb-6 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-athletic">Game Day App</p>
          <h1 className="mt-2 font-display text-4xl font-black uppercase tracking-wide text-foreground">
            Home
          </h1>
        </header>

        <TeamSelector
          prominent
          teams={teams}
          activeTeamId={activeTeamId}
          onTeamChange={onTeamChange}
          onAddTeam={onAddTeam}
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
                Resume Active Match
              </span>
              {activeMatchLabel ? (
                <span className="mt-1 block text-sm font-semibold text-foreground">
                  {activeMatchLabel}
                </span>
              ) : null}
            </button>
          )}

          <HomeActionButton
            icon={<ClipboardList className="size-7" strokeWidth={2.5} />}
            title="New Game"
            description="Pre-game setup and lineup for the active team"
            variant="primary"
            disabled={!teamReady}
            onClick={onNewGame}
          />

          <HomeActionButton
            icon={<Users className="size-7 text-athletic" strokeWidth={2.5} />}
            title="Team Management"
            description="Roster and preset lineups"
            disabled={!teamReady}
            onClick={onTeamManagement}
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
              ? 'mt-0.5 block text-sm font-semibold text-neon-foreground/80'
              : 'mt-0.5 block text-sm font-semibold text-muted-foreground'
          }
        >
          {description}
        </span>
      </span>
    </button>
  )
}
