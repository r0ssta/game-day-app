import { useMemo, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { ScreenHeader } from '@/components/AppNavigation'
import { APP_CONTAINER, APP_SHELL_LOCKED } from '@/lib/layout'
import {
  canFinalizePkShootout,
  createEmptyPkRounds,
  pkScoresFromRounds,
  type PkResult,
  type PkRoundState,
} from '@/lib/penalty-kicks'
import { formatPlayerFullName } from '@/lib/player-names'
import { cn } from '@/lib/utils'
import type { MatchPlayer } from '@/types/match'

type PenaltyShootoutScreenProps = {
  teamName: string
  opponent: string
  regulationHomeScore: number
  regulationAwayScore: number
  players: MatchPlayer[]
  initialRounds?: PkRoundState[]
  busy?: boolean
  onRecordAttempt: (input: {
    round: number
    team: 'us' | 'opponent'
    result: PkResult
    playerId: string | null
  }) => Promise<void> | void
  onFinalize: (input: {
    homePkScore: number
    awayPkScore: number
    pkWinnerIsUs: boolean
    rounds: PkRoundState[]
  }) => Promise<void> | void
  onBackToHome: () => void
}

function ResultButtons({
  value,
  disabled,
  onSelect,
}: {
  value: PkResult | null
  disabled?: boolean
  onSelect: (result: PkResult) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect('make')}
        className={cn(
          'flex min-h-12 touch-manipulation items-center justify-center gap-1 rounded-xl border-2 text-sm font-black uppercase tracking-wide active:scale-[0.98] disabled:opacity-40',
          value === 'make'
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400',
        )}
      >
        <Check className="size-4" strokeWidth={3} />
        Make
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect('miss')}
        className={cn(
          'flex min-h-12 touch-manipulation items-center justify-center gap-1 rounded-xl border-2 text-sm font-black uppercase tracking-wide active:scale-[0.98] disabled:opacity-40',
          value === 'miss'
            ? 'border-danger bg-danger text-danger-foreground'
            : 'border-danger/50 bg-danger/10 text-danger',
        )}
      >
        <X className="size-4" strokeWidth={3} />
        Miss
      </button>
    </div>
  )
}

export function PenaltyShootoutScreen({
  teamName,
  opponent,
  regulationHomeScore,
  regulationAwayScore,
  players,
  initialRounds,
  busy = false,
  onRecordAttempt,
  onFinalize,
  onBackToHome,
}: PenaltyShootoutScreenProps) {
  const [rounds, setRounds] = useState<PkRoundState[]>(
    () => initialRounds ?? createEmptyPkRounds(),
  )
  const [saving, setSaving] = useState(false)

  const attendingPlayers = useMemo(
    () => players.filter((player) => player.attending),
    [players],
  )

  const { homePkScore, awayPkScore } = pkScoresFromRounds(rounds)
  const canFinalize = canFinalizePkShootout(rounds) && !busy && !saving

  const updateRound = async (
    roundNumber: number,
    patch: Partial<PkRoundState>,
    attempt?: {
      team: 'us' | 'opponent'
      result: PkResult
      playerId: string | null
    },
  ) => {
    setRounds((prev) =>
      prev.map((round) => (round.round === roundNumber ? { ...round, ...patch } : round)),
    )
    if (!attempt) return
    setSaving(true)
    try {
      await onRecordAttempt({
        round: roundNumber,
        team: attempt.team,
        result: attempt.result,
        playerId: attempt.playerId,
      })
    } finally {
      setSaving(false)
    }
  }

  const handleFinalize = async () => {
    if (!canFinalize) return
    setSaving(true)
    try {
      await onFinalize({
        homePkScore,
        awayPkScore,
        pkWinnerIsUs: homePkScore > awayPkScore,
        rounds,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className={APP_SHELL_LOCKED}>
      <div className={`${APP_CONTAINER} flex min-h-0 flex-1 flex-col overflow-hidden pt-4 md:pt-5`}>
        <div className="shrink-0 space-y-3">
          <ScreenHeader
            title="Penalty Shootout"
            subtitle={`${teamName.trim() || 'Home'} vs ${opponent.trim() || 'Opponent'} · Regulation ${regulationHomeScore}–${regulationAwayScore}`}
            onHome={onBackToHome}
          />
          <div className="rounded-2xl border-2 border-neon/40 bg-neon/10 px-4 py-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              PK Score
            </p>
            <p className="mt-1 font-display text-4xl font-black tabular-nums text-foreground">
              {homePkScore} – {awayPkScore}
            </p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              {teamName.trim() || 'Us'} · {opponent.trim() || 'Opponent'}
            </p>
          </div>
        </div>

        <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pb-3">
          {rounds.map((round) => (
            <section
              key={round.round}
              className="rounded-2xl border-2 border-border bg-card p-3"
              aria-label={`Round ${round.round}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg font-black uppercase tracking-wide text-foreground">
                  Round {round.round}
                  {round.round > 5 ? (
                    <span className="ml-2 text-xs font-bold uppercase tracking-widest text-athletic">
                      Sudden Death
                    </span>
                  ) : null}
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2 rounded-xl border border-border bg-background p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Us
                  </p>
                  <select
                    value={round.usPlayerId ?? ''}
                    disabled={busy || saving || round.usResult !== null}
                    onChange={(event) => {
                      const playerId = event.target.value || null
                      void updateRound(round.round, { usPlayerId: playerId })
                    }}
                    className="min-h-11 w-full touch-manipulation rounded-xl border-2 border-border bg-card px-3 text-sm font-bold text-foreground"
                  >
                    <option value="">Select taker…</option>
                    {attendingPlayers.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.number != null ? `#${player.number} ` : ''}
                        {formatPlayerFullName(player.firstName, player.lastName)}
                      </option>
                    ))}
                  </select>
                  <ResultButtons
                    value={round.usResult}
                    disabled={busy || saving || !round.usPlayerId || round.usResult !== null}
                    onSelect={(result) => {
                      void updateRound(
                        round.round,
                        { usResult: result },
                        {
                          team: 'us',
                          result,
                          playerId: round.usPlayerId,
                        },
                      )
                    }}
                  />
                </div>

                <div className="space-y-2 rounded-xl border border-border bg-background p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Opponent
                  </p>
                  <div className="flex min-h-11 items-center rounded-xl border-2 border-dashed border-border px-3 text-xs font-semibold text-muted-foreground">
                    No player tracking
                  </div>
                  <ResultButtons
                    value={round.opponentResult}
                    disabled={busy || saving || round.opponentResult !== null}
                    onSelect={(result) => {
                      void updateRound(
                        round.round,
                        { opponentResult: result },
                        {
                          team: 'opponent',
                          result,
                          playerId: null,
                        },
                      )
                    }}
                  />
                </div>
              </div>
            </section>
          ))}
        </div>

        <div className="shrink-0 space-y-2 border-t-2 border-border bg-background pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={busy || saving}
            onClick={() =>
              setRounds((prev) => [
                ...prev,
                {
                  round: prev.length + 1,
                  usPlayerId: null,
                  usResult: null,
                  opponentResult: null,
                },
              ])
            }
            className="flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-border bg-secondary px-4 text-xs font-bold uppercase tracking-wide text-foreground active:scale-[0.98] disabled:opacity-40"
          >
            <Plus className="size-4" strokeWidth={2.5} />
            Add Sudden Death Round
          </button>
          <button
            type="button"
            disabled={!canFinalize}
            onClick={() => void handleFinalize()}
            className="flex min-h-14 w-full touch-manipulation items-center justify-center rounded-2xl bg-neon px-4 font-display text-2xl font-black uppercase tracking-wide text-neon-foreground shadow-xl shadow-neon/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Finalize Shootout'}
          </button>
          {!canFinalize ? (
            <p className="text-center text-xs font-semibold text-muted-foreground">
              Complete rounds until one side leads on PKs, then finalize.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  )
}
