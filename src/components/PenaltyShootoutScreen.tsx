import { useEffect, useMemo, useState } from 'react'
import { Check, Plus, Shield, X } from 'lucide-react'
import { ScreenHeader } from '@/components/AppNavigation'
import { APP_CONTAINER, APP_SHELL_LOCKED, MODAL_OVERLAY, MODAL_PANEL } from '@/lib/layout'
import {
  canFinalizePkShootout,
  createEmptyPkRounds,
  findMatchGoalkeeper,
  pkScoresFromRounds,
  type PkResult,
  type PkRoundState,
  type PkTeam,
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
  gkPlayerId: string | null
  onGkPlayerChange: (playerId: string | null) => void
  initialRounds?: PkRoundState[]
  busy?: boolean
  onRecordAttempt: (input: {
    round: number
    team: PkTeam
    result: PkResult
    playerId: string | null
  }) => Promise<{ eventId?: string } | void>
  onUpdateAttempt: (input: {
    round: number
    team: PkTeam
    action: 'swap' | 'clear'
    eventId: string | null
    previousResult: PkResult
    playerId: string | null
  }) => Promise<void>
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
  onEdit,
}: {
  value: PkResult | null
  disabled?: boolean
  onSelect: (result: PkResult) => void
  onEdit: () => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (value) onEdit()
          else onSelect('make')
        }}
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
        onClick={() => {
          if (value) onEdit()
          else onSelect('miss')
        }}
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

function playerOptionLabel(player: MatchPlayer) {
  return `${player.number != null ? `#${player.number} ` : ''}${formatPlayerFullName(player.firstName, player.lastName)}`
}

export function PenaltyShootoutScreen({
  teamName,
  opponent,
  regulationHomeScore,
  regulationAwayScore,
  players,
  gkPlayerId,
  onGkPlayerChange,
  initialRounds,
  busy = false,
  onRecordAttempt,
  onUpdateAttempt,
  onFinalize,
  onBackToHome,
}: PenaltyShootoutScreenProps) {
  const [rounds, setRounds] = useState<PkRoundState[]>(
    () => initialRounds ?? createEmptyPkRounds(),
  )
  const [saving, setSaving] = useState(false)
  const [editTarget, setEditTarget] = useState<{
    round: number
    team: PkTeam
    result: PkResult
    eventId: string | null
    playerId: string | null
  } | null>(null)

  const attendingPlayers = useMemo(
    () => players.filter((player) => player.attending),
    [players],
  )

  const suggestedGk = useMemo(() => findMatchGoalkeeper(players), [players])

  useEffect(() => {
    if (gkPlayerId) return
    if (!suggestedGk) return
    onGkPlayerChange(suggestedGk.id)
  }, [gkPlayerId, suggestedGk, onGkPlayerChange])

  useEffect(() => {
    if (!initialRounds) return
    setRounds((prev) => {
      const hasLocalResults = prev.some(
        (round) => round.usResult !== null || round.opponentResult !== null,
      )
      return hasLocalResults ? prev : initialRounds
    })
  }, [initialRounds])

  const selectedGk = useMemo(
    () => attendingPlayers.find((player) => player.id === gkPlayerId) ?? null,
    [attendingPlayers, gkPlayerId],
  )

  const { homePkScore, awayPkScore } = pkScoresFromRounds(rounds)
  const canFinalize = canFinalizePkShootout(rounds) && !busy && !saving

  const updateRound = async (
    roundNumber: number,
    patch: Partial<PkRoundState>,
    attempt?: {
      team: PkTeam
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
      const saved = await onRecordAttempt({
        round: roundNumber,
        team: attempt.team,
        result: attempt.result,
        playerId: attempt.playerId,
      })
      if (saved?.eventId) {
        setRounds((prev) =>
          prev.map((round) => {
            if (round.round !== roundNumber) return round
            if (attempt.team === 'us') return { ...round, usEventId: saved.eventId ?? null }
            return { ...round, opponentEventId: saved.eventId ?? null }
          }),
        )
      }
    } catch {
      setRounds((prev) =>
        prev.map((round) => {
          if (round.round !== roundNumber) return round
          if (attempt.team === 'us') {
            return { ...round, usResult: null, usEventId: null }
          }
          return { ...round, opponentResult: null, opponentEventId: null }
        }),
      )
    } finally {
      setSaving(false)
    }
  }

  const applyEdit = async (action: 'swap' | 'clear') => {
    if (!editTarget) return
    const previous = rounds.find((round) => round.round === editTarget.round)
    setSaving(true)
    try {
      await onUpdateAttempt({
        round: editTarget.round,
        team: editTarget.team,
        action,
        eventId: editTarget.eventId,
        previousResult: editTarget.result,
        playerId: editTarget.playerId,
      })
      setRounds((prev) =>
        prev.map((round) => {
          if (round.round !== editTarget.round) return round
          if (action === 'clear') {
            if (editTarget.team === 'us') {
              return { ...round, usResult: null, usEventId: null }
            }
            return { ...round, opponentResult: null, opponentEventId: null }
          }
          const nextResult: PkResult = editTarget.result === 'make' ? 'miss' : 'make'
          if (editTarget.team === 'us') return { ...round, usResult: nextResult }
          return { ...round, opponentResult: nextResult }
        }),
      )
      setEditTarget(null)
    } catch {
      if (previous) {
        setRounds((prev) =>
          prev.map((round) => (round.round === previous.round ? previous : round)),
        )
      }
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

          <div className="rounded-2xl border-2 border-athletic/50 bg-athletic/10 p-3">
            <label
              htmlFor="pk-goalkeeper"
              className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
            >
              <Shield className="size-3.5 text-athletic" strokeWidth={2.5} />
              Our Goalkeeper
            </label>
            <select
              id="pk-goalkeeper"
              value={gkPlayerId ?? ''}
              disabled={busy || saving}
              onChange={(event) => onGkPlayerChange(event.target.value || null)}
              className="min-h-12 w-full touch-manipulation rounded-xl border-2 border-border bg-card px-3 text-base font-bold text-foreground"
            >
              <option value="">Select goalkeeper…</option>
              {attendingPlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {playerOptionLabel(player)}
                </option>
              ))}
            </select>
            {selectedGk ? (
              <p className="mt-2 text-sm font-bold text-foreground">
                In goal vs opponent PKs:{' '}
                <span className="text-athletic">{playerOptionLabel(selectedGk)}</span>
              </p>
            ) : (
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                Choose who is in goal for the shootout.
              </p>
            )}
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
                        {playerOptionLabel(player)}
                      </option>
                    ))}
                  </select>
                  <ResultButtons
                    value={round.usResult}
                    disabled={busy || saving || !round.usPlayerId}
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
                    onEdit={() => {
                      if (!round.usResult) return
                      setEditTarget({
                        round: round.round,
                        team: 'us',
                        result: round.usResult,
                        eventId: round.usEventId,
                        playerId: round.usPlayerId,
                      })
                    }}
                  />
                </div>

                <div className="space-y-2 rounded-xl border border-border bg-background p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Opponent
                  </p>
                  <div className="flex min-h-11 items-center rounded-xl border-2 border-dashed border-border px-3 text-xs font-semibold text-muted-foreground">
                    {selectedGk
                      ? `Our GK: ${playerOptionLabel(selectedGk)}`
                      : 'No GK selected'}
                  </div>
                  <ResultButtons
                    value={round.opponentResult}
                    disabled={busy || saving}
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
                    onEdit={() => {
                      if (!round.opponentResult) return
                      setEditTarget({
                        round: round.round,
                        team: 'opponent',
                        result: round.opponentResult,
                        eventId: round.opponentEventId,
                        playerId: null,
                      })
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
                  usEventId: null,
                  opponentEventId: null,
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
      {editTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-pk-title"
          className={MODAL_OVERLAY}
          onClick={() => {
            if (!saving) setEditTarget(null)
          }}
        >
          <div
            className={cn(MODAL_PANEL, 'border-2 border-border')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-5 pb-2 pt-4">
              <h2
                id="update-pk-title"
                className="font-display text-2xl font-black uppercase tracking-wide text-foreground"
              >
                Update PK Result?
              </h2>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                Round {editTarget.round} · {editTarget.team === 'us' ? 'Us' : 'Opponent'} ·{' '}
                {editTarget.result === 'make' ? 'Made' : 'Missed'}
              </p>
            </div>
            <div className="flex flex-col gap-2 px-5 py-4">
              <button
                type="button"
                disabled={busy || saving}
                onClick={() => void applyEdit('swap')}
                className="min-h-14 touch-manipulation rounded-xl border-2 border-athletic bg-athletic/15 px-4 py-3 text-sm font-bold uppercase tracking-wide text-athletic active:scale-[0.98] disabled:opacity-50"
              >
                {editTarget.result === 'make' ? 'Change to Miss' : 'Change to Made'}
              </button>
              <button
                type="button"
                disabled={busy || saving}
                onClick={() => void applyEdit('clear')}
                className="min-h-14 touch-manipulation rounded-xl border-2 border-danger bg-danger/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-danger active:scale-[0.98] disabled:opacity-50"
              >
                Clear / Undo
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditTarget(null)}
                className="min-h-11 touch-manipulation rounded-xl border-2 border-border bg-card px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground active:scale-[0.98] disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
