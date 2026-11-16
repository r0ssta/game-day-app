import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Clock, Minus, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  formatGoalMinuteMark,
  goalEventsForSide,
  goalMinuteFromTimestamp,
  REMOVE_GOAL_REASON_LABELS,
  timestampFromGoalMinute,
  type ModifyGoalRow,
  type ModifyGoalSide,
} from '@/lib/modify-goals'
import { buildSidelineNameMap, getSidelineName } from '@/lib/player-names'
import { removeGoalForMatch } from '@/lib/remove-goal'
import { fetchMatchEvents } from '@/lib/supabase-api'
import { formatMatchWriteError } from '@/lib/match-api'
import { updateGoalForMatch } from '@/lib/update-goal'
import { MODAL_OVERLAY, MODAL_PANEL, TOUCH_ICON_BUTTON } from '@/lib/layout'
import { cn } from '@/lib/utils'
import type { RemoveGoalReason } from '@/schemas/match-actions'
import type { DbMatchEvent } from '@/types/database'

export type ModifyGoalsPlayer = {
  id: string
  number: number | null
  firstName: string
  lastName: string
  attending?: boolean
  isOnField?: boolean
  matchPosition?: string
}

type SheetView =
  | 'list'
  | 'actions'
  | 'remove-reason'
  | 'edit-scorer'
  | 'edit-assist'
  | 'edit-minute'

type ModifyGoalsSheetProps = {
  open: boolean
  side: ModifyGoalSide
  matchId: string
  players: ModifyGoalsPlayer[]
  teamName: string
  opponent: string
  teamSlug?: string | null
  busy?: boolean
  onRemoved: (result: {
    homeScore: number
    awayScore: number
    removedPairedShot: boolean
    side: ModifyGoalSide
    reason: RemoveGoalReason
  }) => void
  onUpdated: () => void
  onToast: (message: string) => void
  onClose: () => void
}

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

function playerLabel(
  playerId: string | null,
  players: ModifyGoalsPlayer[],
  sidelineNameMap: Map<string, string>,
  fallback: string,
): string {
  if (!playerId) return fallback
  const player = players.find((entry) => entry.id === playerId)
  if (!player) return fallback
  return getSidelineName(player, sidelineNameMap)
}

export function ModifyGoalsSheet({
  open,
  side,
  matchId,
  players,
  teamName,
  opponent,
  teamSlug = null,
  busy = false,
  onRemoved,
  onUpdated,
  onToast,
  onClose,
}: ModifyGoalsSheetProps) {
  const [view, setView] = useState<SheetView>('list')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [events, setEvents] = useState<DbMatchEvent[]>([])
  const [selected, setSelected] = useState<ModifyGoalRow | null>(null)
  const [draftScorerId, setDraftScorerId] = useState<string | null>(null)
  const [draftMinute, setDraftMinute] = useState(0)

  const onToastRef = useRef(onToast)
  const onCloseRef = useRef(onClose)
  onToastRef.current = onToast
  onCloseRef.current = onClose

  const sidelineNameMap = useMemo(() => buildSidelineNameMap(players), [players])
  const goals = useMemo(() => goalEventsForSide(events, side), [events, side])
  const selectablePlayers = useMemo(() => {
    const attending = players.filter((player) => player.attending !== false)
    return attending.length > 0 ? attending : players
  }, [players])

  useEffect(() => {
    if (!open) return
    setView('list')
    setSelected(null)
    setDraftScorerId(null)
    setDraftMinute(0)
    setSaving(false)
    let cancelled = false
    setLoading(true)
    void fetchMatchEvents(matchId)
      .then((rows) => {
        if (!cancelled) setEvents(rows)
      })
      .catch((err) => {
        console.error('[ModifyGoalsSheet] load', err)
        if (!cancelled) {
          onToastRef.current(formatMatchWriteError(err, 'Could not load goals'))
          onCloseRef.current()
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, matchId])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || saving || busy) return
      if (view === 'list') onClose()
      else if (view === 'actions') {
        setSelected(null)
        setView('list')
      } else if (
        view === 'remove-reason' ||
        view === 'edit-scorer' ||
        view === 'edit-minute'
      ) {
        setView('actions')
      } else if (view === 'edit-assist') {
        setView('edit-scorer')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, view, saving, busy, onClose])

  if (!open) return null

  const sideLabel = side === 'home' ? teamName.trim() || 'Home' : opponent.trim() || 'Opponent'
  const title =
    view === 'list'
      ? 'Modify Goals'
      : view === 'actions'
        ? 'Goal'
        : view === 'remove-reason'
          ? 'Remove Goal'
          : view === 'edit-scorer'
            ? 'Who scored?'
            : view === 'edit-assist'
              ? 'Who assisted?'
              : 'Minute scored'

  const goBack = () => {
    if (saving || busy) return
    if (view === 'list') onClose()
    else if (view === 'actions') {
      setSelected(null)
      setView('list')
    } else if (
      view === 'remove-reason' ||
      view === 'edit-scorer' ||
      view === 'edit-minute'
    ) {
      setView('actions')
    } else if (view === 'edit-assist') {
      setView('edit-scorer')
    }
  }

  const openGoal = (goal: ModifyGoalRow) => {
    setSelected(goal)
    setView('actions')
  }

  const handleRemove = async (reason: RemoveGoalReason) => {
    if (!selected || saving) return
    setSaving(true)
    try {
      const result = await removeGoalForMatch(matchId, selected.id, reason, teamSlug)
      onRemoved(result)
      onToast(
        reason === 'accident'
          ? 'Removed goal (logged by accident)'
          : 'Removed goal (offside / ref)',
      )
      onClose()
    } catch (err) {
      console.error('[ModifyGoalsSheet] remove', err)
      onToast(formatMatchWriteError(err, 'Could not remove goal — try again'))
    } finally {
      setSaving(false)
    }
  }

  const finishCreditsEdit = async (scorerId: string | null, assistPlayerId: string | null) => {
    if (!selected || saving) return
    setSaving(true)
    try {
      await updateGoalForMatch({
        matchId,
        eventId: selected.id,
        scorerId,
        assistPlayerId,
        teamSlug,
      })
      onUpdated()
      onToast('Updated goal credits')
      onClose()
    } catch (err) {
      console.error('[ModifyGoalsSheet] update credits', err)
      onToast(formatMatchWriteError(err, 'Could not update goal — try again'))
    } finally {
      setSaving(false)
    }
  }

  const finishMinuteEdit = async () => {
    if (!selected || saving) return
    const nextTimestamp = timestampFromGoalMinute(draftMinute)
    if (nextTimestamp === selected.timestamp) {
      setView('actions')
      return
    }
    setSaving(true)
    try {
      await updateGoalForMatch({
        matchId,
        eventId: selected.id,
        timestamp: nextTimestamp,
        teamSlug,
      })
      onUpdated()
      onToast(`Updated goal minute to ${draftMinute}'`)
      onClose()
    } catch (err) {
      console.error('[ModifyGoalsSheet] update minute', err)
      onToast(formatMatchWriteError(err, 'Could not update minute — try again'))
    } finally {
      setSaving(false)
    }
  }

  const locked = saving || busy || loading

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modify-goals-title"
      className={MODAL_OVERLAY}
      onClick={() => {
        if (!locked) onClose()
      }}
    >
      <div
        className={cn(MODAL_PANEL, 'border-2 border-border')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-border px-5 pb-3 pt-4">
          <div className="flex min-w-0 items-start gap-2">
            {view !== 'list' ? (
              <button
                type="button"
                onClick={goBack}
                disabled={locked}
                aria-label="Back"
                className={`${TOUCH_ICON_BUTTON} bg-secondary text-foreground disabled:opacity-50`}
              >
                <ChevronLeft className="size-6" strokeWidth={3} />
              </button>
            ) : null}
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                {sideLabel}
              </div>
              <h2
                id="modify-goals-title"
                className="mt-1 font-display text-2xl font-black uppercase tracking-wide text-foreground"
              >
                {title}
              </h2>
              {view === 'list' ? (
                <p className="mt-1 text-sm font-semibold text-muted-foreground">
                  Remove a goal, fix scorer / assist, or change the minute
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            aria-label="Close"
            className={`${TOUCH_ICON_BUTTON} bg-secondary text-foreground disabled:opacity-50`}
          >
            <X className="size-6" strokeWidth={3} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm font-semibold text-muted-foreground">
              Loading goals…
            </p>
          ) : null}

          {!loading && view === 'list' ? (
            goals.length === 0 ? (
              <p className="py-8 text-center text-sm font-semibold text-muted-foreground">
                No goals recorded for this side
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {goals.map((goal, index) => {
                  const scorer = goal.isOwnGoal
                    ? 'Own Goal'
                    : playerLabel(goal.scorerId, players, sidelineNameMap, sideLabel)
                  const assist = goal.assistPlayerId
                    ? playerLabel(goal.assistPlayerId, players, sidelineNameMap, 'Unknown')
                    : null
                  return (
                    <li key={goal.id}>
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => openGoal(goal)}
                        className="flex min-h-14 w-full touch-manipulation items-center gap-3 rounded-xl border-2 border-border bg-card px-4 py-3 text-left transition-transform active:scale-[0.98] disabled:opacity-50"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-secondary font-display text-sm font-black tabular-nums text-foreground">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-bold text-foreground">
                            {scorer}
                            {goal.isPk ? (
                              <span className="ml-1 text-xs font-black uppercase tracking-wide text-muted-foreground">
                                Pen
                              </span>
                            ) : null}
                          </span>
                          <span className="block truncate text-xs font-semibold text-muted-foreground">
                            {formatGoalMinuteMark(goal.timestamp)}
                            {assist
                              ? ` · Assist: ${assist}`
                              : goal.canEditCredits
                                ? ' · Unassisted'
                                : ''}
                            {goal.eventNotes && !goal.isOwnGoal && !goal.isPk
                              ? ` · ${goal.eventNotes}`
                              : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )
          ) : null}

          {!loading && view === 'actions' && selected ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-border bg-secondary/40 px-4 py-3">
                <p className="font-display text-lg font-black uppercase tracking-wide text-foreground">
                  {selected.isOwnGoal
                    ? 'Own Goal'
                    : playerLabel(selected.scorerId, players, sidelineNameMap, sideLabel)}
                </p>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">
                  {formatGoalMinuteMark(selected.timestamp)}
                  {selected.assistPlayerId
                    ? ` · Assist: ${playerLabel(selected.assistPlayerId, players, sidelineNameMap, 'Unknown')}`
                    : selected.canEditCredits
                      ? ' · Unassisted'
                      : ''}
                </p>
              </div>

              {selected.canEditCredits ? (
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    setDraftScorerId(selected.scorerId)
                    setView('edit-scorer')
                  }}
                  className="flex min-h-14 touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-neon/40 bg-neon/10 px-4 font-display text-lg font-black uppercase tracking-wide text-neon active:scale-[0.98] disabled:opacity-50"
                >
                  <Pencil className="size-5" strokeWidth={2.5} />
                  Change scorer / assist
                </button>
              ) : null}

              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  setDraftMinute(goalMinuteFromTimestamp(selected.timestamp))
                  setView('edit-minute')
                }}
                className="flex min-h-14 touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-4 font-display text-lg font-black uppercase tracking-wide text-foreground active:scale-[0.98] disabled:opacity-50"
              >
                <Clock className="size-5" strokeWidth={2.5} />
                Change minute
              </button>

              <button
                type="button"
                disabled={locked}
                onClick={() => setView('remove-reason')}
                className="flex min-h-14 touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-danger/40 bg-danger/10 px-4 font-display text-lg font-black uppercase tracking-wide text-danger active:scale-[0.98] disabled:opacity-50"
              >
                <Trash2 className="size-5" strokeWidth={2.5} />
                Remove goal
              </button>
            </div>
          ) : null}

          {!loading && view === 'remove-reason' ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-muted-foreground">
                Why are you removing this goal from the score?
              </p>
              {(Object.keys(REMOVE_GOAL_REASON_LABELS) as RemoveGoalReason[]).map((reason) => (
                <button
                  key={reason}
                  type="button"
                  disabled={locked}
                  onClick={() => void handleRemove(reason)}
                  className="min-h-16 touch-manipulation rounded-xl border-2 border-border bg-card px-4 py-5 text-left font-display text-xl font-black tracking-wide text-foreground transition-transform active:scale-[0.98] active:bg-secondary disabled:opacity-50"
                >
                  {REMOVE_GOAL_REASON_LABELS[reason]}
                </button>
              ))}
            </div>
          ) : null}

          {!loading && view === 'edit-minute' ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm font-semibold text-muted-foreground">
                Minute on the period clock when this goal was scored.
              </p>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  disabled={locked || draftMinute <= 0}
                  aria-label="Decrease minute"
                  onClick={() => setDraftMinute((value) => Math.max(0, value - 1))}
                  className={`${TOUCH_ICON_BUTTON} border-2 border-border bg-card text-foreground disabled:opacity-40`}
                >
                  <Minus className="size-6" strokeWidth={3} />
                </button>
                <label className="flex flex-col items-center gap-1">
                  <span className="sr-only">Minute</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={120}
                    disabled={locked}
                    value={draftMinute}
                    onChange={(event) => {
                      const raw = Number(event.target.value)
                      if (!Number.isFinite(raw)) return
                      setDraftMinute(Math.max(0, Math.min(120, Math.floor(raw))))
                    }}
                    className="w-24 rounded-xl border-2 border-border bg-card px-3 py-3 text-center font-display text-3xl font-black tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/40"
                  />
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    minute
                  </span>
                </label>
                <button
                  type="button"
                  disabled={locked || draftMinute >= 120}
                  aria-label="Increase minute"
                  onClick={() => setDraftMinute((value) => Math.min(120, value + 1))}
                  className={`${TOUCH_ICON_BUTTON} border-2 border-border bg-card text-foreground disabled:opacity-40`}
                >
                  <Plus className="size-6" strokeWidth={3} />
                </button>
              </div>
              <button
                type="button"
                disabled={locked}
                onClick={() => void finishMinuteEdit()}
                className="flex min-h-14 touch-manipulation items-center justify-center rounded-xl bg-neon px-4 font-display text-lg font-black uppercase tracking-wide text-neon-foreground active:scale-[0.98] disabled:opacity-50"
              >
                Save minute
              </button>
            </div>
          ) : null}

          {!loading && (view === 'edit-scorer' || view === 'edit-assist') ? (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  if (view === 'edit-scorer') {
                    void finishCreditsEdit(null, null)
                  } else {
                    void finishCreditsEdit(draftScorerId, null)
                  }
                }}
                className="min-h-11 w-full touch-manipulation rounded-xl border-2 border-dashed border-border bg-transparent py-4 font-display text-lg font-black uppercase tracking-wide text-muted-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                {view === 'edit-scorer' ? 'Don’t tag' : 'Unassisted'}
              </button>

              {selectablePlayers.length === 0 ? (
                <p className="py-6 text-center text-sm font-semibold text-muted-foreground">
                  No players available
                </p>
              ) : (
                <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-1">
                  {selectablePlayers
                    .filter((player) =>
                      view === 'edit-assist' ? player.id !== draftScorerId : true,
                    )
                    .map((player) => (
                      <li key={player.id}>
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => {
                            if (view === 'edit-scorer') {
                              setDraftScorerId(player.id)
                              if (selected?.isPk) {
                                void finishCreditsEdit(player.id, null)
                              } else {
                                setView('edit-assist')
                              }
                            } else {
                              void finishCreditsEdit(draftScorerId, player.id)
                            }
                          }}
                          className="flex min-h-11 w-full touch-manipulation items-center gap-4 rounded-xl border-2 border-border bg-card px-4 py-4 text-left transition-transform active:scale-[0.98] active:bg-secondary disabled:opacity-50"
                        >
                          <span className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-neon/40 bg-neon/10 font-display text-2xl font-bold tabular-nums text-neon">
                            {formatJersey(player.number)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xl font-bold leading-tight text-foreground">
                              {getSidelineName(player, sidelineNameMap)}
                            </span>
                            {player.matchPosition ? (
                              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {player.matchPosition}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
