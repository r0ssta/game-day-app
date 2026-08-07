import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Users } from 'lucide-react'
import { SoccerPitchSurface } from '@/components/SoccerPitchSurface'
import {
  buildAssignmentsFromStarters,
  getFormationById,
  getFormationsForFormat,
  remapFormationSlotAssignments,
  slotToTacticalPosition,
  type FormationRemapResult,
  type FormationSlot,
} from '@/lib/formations'
import type { TeamFormat } from '@/lib/team-format'
import {
  buildSidelineNameMap,
  formatPlayerLabel,
  getSidelineName,
} from '@/lib/player-names'
import { formatPlayingTimeClock, getLiveSecondsPlayed } from '@/lib/play-time'
import { displayMatchPosition } from '@/lib/positions'
import { cn } from '@/lib/utils'
import { PITCH_BENCH_LAYOUT, PITCH_BENCH_SIDEBAR } from '@/lib/layout'
import type { Impact, MatchPlayer } from '@/types/match'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

const IMPACT_RING: Record<Impact, string> = {
  neutral: 'border-white/70',
  positive: 'border-neon ring-2 ring-neon/50',
  negative: 'border-danger ring-2 ring-danger/50',
}

const SELECTED_RING =
  'ring-4 ring-white shadow-[0_0_18px_rgba(255,255,255,0.65)] scale-105 z-20'

export type PositionReassignUpdate = {
  playerId: string
  position: string
}

type LiveTacticalPitchProps = {
  players: MatchPlayer[]
  clockSeconds: number
  maxFieldPlayers: number
  periodKey: string
  formationId: string
  onFormationSwitch: (formationId: string, remap: FormationRemapResult) => void
  onSwap: (benchId: string, fieldId: string, tacticalPosition: string) => void
  onSubIn: (benchId: string, tacticalPosition: string) => void
  onSubOut: (fieldId: string) => void
  onReassignPosition: (updates: PositionReassignUpdate[]) => void
  onSetImpact?: (id: string, impact: Impact) => void
  initialSlotAssignments?: Record<string, string | null>
  teamFormat?: TeamFormat
}

export type LiveTacticalPitchHandle = {
  getSlotAssignments: () => Record<string, string | null>
}

type FieldSelection = { kind: 'field'; slotId: string; playerId: string | null }
type BenchSelection = { kind: 'bench'; playerId: string }
type TapSelection = FieldSelection | BenchSelection

function ImpactToggleGroup({
  impact,
  onSetImpact,
  compact,
}: {
  impact: Impact
  onSetImpact: (impact: Impact) => void
  compact?: boolean
}) {
  const size = compact ? 'size-10 min-h-11 min-w-11 text-[10px]' : 'size-11 text-xs'
  return (
    <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
      {(['negative', 'neutral', 'positive'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-label={`${value} impact`}
          onClick={() => onSetImpact(value)}
          className={cn(
            'flex items-center justify-center rounded-md font-bold active:scale-90',
            size,
            impact === value
              ? value === 'positive'
                ? 'bg-neon text-neon-foreground'
                : value === 'negative'
                  ? 'bg-danger text-danger-foreground'
                  : 'bg-muted-foreground/30 text-foreground'
              : 'bg-secondary/80 text-muted-foreground',
          )}
        >
          {value === 'negative' ? '−' : value === 'positive' ? '+' : '='}
        </button>
      ))}
    </div>
  )
}

function LivePitchPlayerBadge({
  player,
  displayName,
  clockSeconds,
  slotLabel,
  selected,
  swapTarget,
  flashed,
  onTap,
  onSetImpact,
}: {
  player: MatchPlayer | null
  displayName: string
  clockSeconds: number
  slotLabel: string
  selected: boolean
  swapTarget: boolean
  flashed: boolean
  onTap: () => void
  onSetImpact?: (impact: Impact) => void
}) {
  const liveSeconds = player ? getLiveSecondsPlayed(player, clockSeconds) : 0
  const positionLabel = player ? displayMatchPosition(player.matchPosition) : slotLabel

  return (
    <button
      type="button"
      onClick={onTap}
      aria-pressed={selected}
      className={cn(
        'absolute flex min-h-[44px] min-w-[44px] -translate-x-1/2 -translate-y-1/2 touch-manipulation flex-col items-center justify-center transition-transform duration-150 active:scale-95',
        selected && SELECTED_RING,
        swapTarget && !selected && 'ring-2 ring-athletic/80 scale-105',
      )}
    >
      {player ? (
        <div
          className={cn(
            'flex min-w-[5.25rem] flex-col items-center rounded-2xl border-2 bg-neon px-1.5 py-2 text-neon-foreground shadow-lg transition-all duration-300',
            IMPACT_RING[player.impact],
            flashed && 'animate-pulse ring-4 ring-white/90 brightness-125',
          )}
        >
          <span className="font-display text-lg font-black leading-none tabular-nums">
            {formatJersey(player.number)}
          </span>
          <span className="max-w-[4.75rem] truncate text-[10px] font-bold leading-tight">
            {displayName}
          </span>
          <span className="max-w-[4.75rem] truncate text-[8px] font-black uppercase tracking-wide text-neon-foreground/80">
            {positionLabel}
          </span>
          <span className="font-mono text-[10px] font-bold tabular-nums text-neon-foreground/90">
            {formatPlayingTimeClock(liveSeconds)}
          </span>
          {onSetImpact && (
            <ImpactToggleGroup impact={player.impact} onSetImpact={onSetImpact} compact />
          )}
        </div>
      ) : (
        <div
          className={cn(
            'flex size-14 flex-col items-center justify-center rounded-full border-2 border-dashed bg-black/25 text-white/90 backdrop-blur-sm',
            swapTarget && 'border-athletic bg-athletic/25 ring-2 ring-athletic/70',
          )}
        >
          <span className="text-[10px] font-black uppercase">{slotLabel}</span>
        </div>
      )}
    </button>
  )
}

function BenchPlayerRow({
  player,
  displayName,
  clockSeconds,
  selected,
  swapTarget,
  onTap,
  onSetImpact,
}: {
  player: MatchPlayer
  displayName: string
  clockSeconds: number
  selected: boolean
  swapTarget: boolean
  onTap: () => void
  onSetImpact?: (impact: Impact) => void
}) {
  const liveSeconds = getLiveSecondsPlayed(player, clockSeconds)

  return (
    <li>
      <button
        type="button"
        onClick={onTap}
        aria-pressed={selected}
        className={cn(
          'flex min-h-[52px] w-full touch-manipulation items-center gap-3 rounded-xl border-2 bg-card px-3 py-3 text-left active:scale-[0.98]',
          selected
            ? 'border-neon bg-neon/10 shadow-[0_0_16px_rgba(var(--neon-rgb,255,255,0),0.35)]'
            : swapTarget
              ? 'border-athletic bg-athletic/10'
              : 'border-border',
        )}
      >
        <div
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-full border-2 font-display text-lg font-bold tabular-nums',
            onSetImpact ? IMPACT_RING[player.impact] : 'border-border',
            'bg-secondary text-foreground',
          )}
        >
          {formatJersey(player.number)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-base font-bold text-foreground">{displayName}</span>
            <span className="font-mono text-xs font-bold tabular-nums text-blue-400">
              {formatPlayingTimeClock(liveSeconds)}
            </span>
          </div>
        </div>
        {onSetImpact && (
          <ImpactToggleGroup impact={player.impact} onSetImpact={onSetImpact} compact />
        )}
      </button>
    </li>
  )
}

export const LiveTacticalPitch = forwardRef<LiveTacticalPitchHandle, LiveTacticalPitchProps>(
  function LiveTacticalPitch(
    {
      players,
      clockSeconds,
      maxFieldPlayers,
      periodKey,
      formationId,
      onFormationSwitch,
      onSwap,
      onSubIn,
      onSubOut,
      onReassignPosition,
      onSetImpact,
      initialSlotAssignments,
      teamFormat,
    },
    ref,
  ) {
    const availableFormations = useMemo(
      () => (teamFormat ? getFormationsForFormat(teamFormat) : getFormationsForFormat('9v9')),
      [teamFormat],
    )
    const [slotAssignments, setSlotAssignments] = useState<Record<string, string | null>>({})
    const slotAssignmentsRef = useRef(slotAssignments)
    slotAssignmentsRef.current = slotAssignments

    useImperativeHandle(ref, () => ({
      getSlotAssignments: () => slotAssignmentsRef.current,
    }))

    const [selection, setSelection] = useState<TapSelection | null>(null)
    const [flashedPlayerIds, setFlashedPlayerIds] = useState<Set<string>>(new Set())
    const hydratedKeyRef = useRef<string | null>(null)
    const skipOnFieldSyncRef = useRef(false)
    const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const formation = getFormationById(formationId, teamFormat)
    const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
    const slotById = useMemo(() => new Map(formation.slots.map((s) => [s.id, s])), [formation.slots])

    const onFieldPlayers = useMemo(
      () => players.filter((p) => p.attending && p.isOnField),
      [players],
    )
  const benchPlayers = useMemo(
    () => players.filter((p) => p.attending && !p.isOnField),
    [players],
  )

  const sidelineNameMap = useMemo(
    () => buildSidelineNameMap(players.filter((p) => p.attending)),
    [players],
  )

    const selectionLabel = useMemo(() => {
      if (!selection) return null
      if (selection.kind === 'bench') {
        const player = playerById.get(selection.playerId)
        return player
          ? formatPlayerLabel(player, sidelineNameMap)
          : 'Bench player'
      }
      if (selection.playerId) {
        const player = playerById.get(selection.playerId)
        return player
          ? formatPlayerLabel(player, sidelineNameMap)
          : 'Field player'
      }
      const slot = slotById.get(selection.slotId)
      return slot ? `Empty ${slot.label} slot` : 'Empty slot'
    }, [selection, playerById, slotById, sidelineNameMap])

    useEffect(() => {
      return () => {
        if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
      }
    }, [])

    useEffect(() => {
      setSelection(null)
    }, [periodKey, formationId])

    useEffect(() => {
      if (hydratedKeyRef.current === periodKey) return
      hydratedKeyRef.current = periodKey

      if (initialSlotAssignments && Object.values(initialSlotAssignments).some(Boolean)) {
        setSlotAssignments(initialSlotAssignments)
        skipOnFieldSyncRef.current = true
        return
      }

      const starters = Object.fromEntries(players.map((p) => [p.id, p.attending && p.isOnField]))
      setSlotAssignments(
        buildAssignmentsFromStarters(
          formation,
          players.map((p) => ({ id: p.id, matchPosition: p.matchPosition, position: p.position })),
          starters,
        ),
      )
      skipOnFieldSyncRef.current = true
    }, [periodKey, formation, players, initialSlotAssignments])

    useEffect(() => {
      if (skipOnFieldSyncRef.current) {
        skipOnFieldSyncRef.current = false
        return
      }

      setSlotAssignments((prev) => {
        const onFieldIds = new Set(onFieldPlayers.map((p) => p.id))
        let changed = false
        const next = { ...prev }
        for (const [slotId, playerId] of Object.entries(next)) {
          if (playerId && !onFieldIds.has(playerId)) {
            next[slotId] = null
            changed = true
          }
        }
        return changed ? next : prev
      })
    }, [onFieldPlayers])

    const flashPlayers = useCallback((playerIds: string[]) => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
      setFlashedPlayerIds(new Set(playerIds))
      flashTimeoutRef.current = setTimeout(() => setFlashedPlayerIds(new Set()), 700)
    }, [])

    const syncSlotForFieldPlayer = useCallback((fieldId: string, slotId: string | null) => {
      setSlotAssignments((prev) => {
        const next = { ...prev }
        for (const [id, assigned] of Object.entries(next)) {
          if (assigned === fieldId) next[id] = null
        }
        if (slotId) next[slotId] = fieldId
        return next
      })
    }, [])

    const getOnFieldPlayerAtSlot = useCallback(
      (slotId: string): string | null => {
        const playerId = slotAssignments[slotId] ?? null
        if (!playerId) return null
        const player = playerById.get(playerId)
        return player?.isOnField ? playerId : null
      },
      [slotAssignments, playerById],
    )

    const handleFieldReassign = useCallback(
      (sourceSlotId: string, targetSlot: FormationSlot, draggedPlayerId: string) => {
        const occupantId = slotAssignments[targetSlot.id] ?? null
        const sourceSlot = slotById.get(sourceSlotId)
        if (!sourceSlot) return

        const targetPosition = slotToTacticalPosition(targetSlot)
        const updates: PositionReassignUpdate[] = [
          { playerId: draggedPlayerId, position: targetPosition },
        ]

        if (occupantId && occupantId !== draggedPlayerId) {
          updates.push({
            playerId: occupantId,
            position: slotToTacticalPosition(sourceSlot),
          })
        }

        setSlotAssignments((prev) => ({
          ...prev,
          [sourceSlotId]: occupantId && occupantId !== draggedPlayerId ? occupantId : null,
          [targetSlot.id]: draggedPlayerId,
        }))

        onReassignPosition(updates)
        flashPlayers(updates.map((u) => u.playerId))
      },
      [slotAssignments, slotById, onReassignPosition, flashPlayers],
    )

    const executeFieldToField = useCallback(
      (sourceSlotId: string, sourcePlayerId: string, targetSlotId: string) => {
        const targetSlot = slotById.get(targetSlotId)
        if (!targetSlot || sourceSlotId === targetSlotId) return

        const targetPlayerId = getOnFieldPlayerAtSlot(targetSlotId)
        handleFieldReassign(sourceSlotId, targetSlot, sourcePlayerId)

        if (!targetPlayerId) {
          // Moved into an empty slot — handleFieldReassign already updated assignments.
          return
        }
      },
      [slotById, getOnFieldPlayerAtSlot, handleFieldReassign],
    )

    const executeBenchToField = useCallback(
      (benchPlayerId: string, targetSlotId: string) => {
        const targetSlot = slotById.get(targetSlotId)
        if (!targetSlot) return

        const benchPlayer = playerById.get(benchPlayerId)
        if (!benchPlayer || benchPlayer.isOnField) return

        const tacticalPosition = slotToTacticalPosition(targetSlot)
        const occupantId = getOnFieldPlayerAtSlot(targetSlotId)

        if (occupantId) {
          onSwap(benchPlayerId, occupantId, tacticalPosition)
          setSlotAssignments((prev) => ({ ...prev, [targetSlotId]: benchPlayerId }))
          flashPlayers([benchPlayerId, occupantId])
          return
        }

        if (onFieldPlayers.length >= maxFieldPlayers) return

        onSubIn(benchPlayerId, tacticalPosition)
        setSlotAssignments((prev) => ({ ...prev, [targetSlotId]: benchPlayerId }))
        flashPlayers([benchPlayerId])
      },
      [
        slotById,
        playerById,
        getOnFieldPlayerAtSlot,
        onFieldPlayers.length,
        maxFieldPlayers,
        onSwap,
        onSubIn,
        flashPlayers,
      ],
    )

    const executeFieldToBench = useCallback(
      (fieldPlayerId: string, benchPlayerId: string) => {
        const sourceSlotId = Object.entries(slotAssignments).find(
          ([, id]) => id === fieldPlayerId,
        )?.[0]
        const targetSlot = sourceSlotId ? slotById.get(sourceSlotId) : null
        if (!targetSlot) return

        const benchPlayer = playerById.get(benchPlayerId)
        if (!benchPlayer || benchPlayer.isOnField) return

        const tacticalPosition = slotToTacticalPosition(targetSlot)
        onSwap(benchPlayerId, fieldPlayerId, tacticalPosition)
        setSlotAssignments((prev) => ({ ...prev, [sourceSlotId!]: benchPlayerId }))
        flashPlayers([benchPlayerId, fieldPlayerId])
      },
      [slotAssignments, slotById, playerById, onSwap, flashPlayers],
    )

    const executeFieldSubOut = useCallback(
      (fieldPlayerId: string) => {
        onSubOut(fieldPlayerId)
        syncSlotForFieldPlayer(fieldPlayerId, null)
        flashPlayers([fieldPlayerId])
      },
      [onSubOut, syncSlotForFieldPlayer, flashPlayers],
    )

    const resolvePair = useCallback(
      (first: TapSelection, second: TapSelection) => {
        if (first.kind === 'field' && second.kind === 'field') {
          if (first.playerId && second.playerId) {
            executeFieldToField(first.slotId, first.playerId, second.slotId)
            return
          }
          if (first.playerId && !second.playerId) {
            const targetSlot = slotById.get(second.slotId)
            if (targetSlot) handleFieldReassign(first.slotId, targetSlot, first.playerId)
            return
          }
          if (!first.playerId && second.playerId) {
            const targetSlot = slotById.get(first.slotId)
            if (targetSlot) handleFieldReassign(second.slotId, targetSlot, second.playerId)
            return
          }
          return
        }

        if (first.kind === 'bench' && second.kind === 'field') {
          executeBenchToField(first.playerId, second.slotId)
          return
        }

        if (first.kind === 'field' && second.kind === 'bench') {
          if (first.playerId) {
            executeFieldToBench(first.playerId, second.playerId)
          }
          return
        }
      },
      [
        executeFieldToField,
        slotById,
        handleFieldReassign,
        executeBenchToField,
        executeFieldToBench,
      ],
    )

    const isSameSelection = (a: TapSelection, b: TapSelection) => {
      if (a.kind !== b.kind) return false
      if (a.kind === 'bench' && b.kind === 'bench') return a.playerId === b.playerId
      if (a.kind === 'field' && b.kind === 'field') {
        return a.slotId === b.slotId && a.playerId === b.playerId
      }
      return false
    }

    const handleFieldSlotTap = useCallback(
      (slotId: string) => {
        const playerId = getOnFieldPlayerAtSlot(slotId)
        const next: FieldSelection = { kind: 'field', slotId, playerId }

        if (!selection) {
          setSelection(next)
          return
        }

        if (isSameSelection(selection, next)) {
          setSelection(null)
          return
        }

        resolvePair(selection, next)
        setSelection(null)
      },
      [getOnFieldPlayerAtSlot, selection, resolvePair],
    )

    const handleBenchPlayerTap = useCallback(
      (playerId: string) => {
        const next: BenchSelection = { kind: 'bench', playerId }

        if (!selection) {
          setSelection(next)
          return
        }

        if (isSameSelection(selection, next)) {
          setSelection(null)
          return
        }

        resolvePair(selection, next)
        setSelection(null)
      },
      [selection, resolvePair],
    )

    const handleFormationChange = (nextId: string) => {
      if (nextId === formationId) return
      if (teamFormat && !availableFormations.some((entry) => entry.id === nextId)) return

      const nextFormation = getFormationById(nextId, teamFormat)
      const onFieldIds = new Set(onFieldPlayers.map((p) => p.id))
      const remap = remapFormationSlotAssignments(
        slotAssignments,
        nextFormation,
        players.map((p) => ({
          id: p.id,
          matchPosition: p.matchPosition,
          position: p.position,
        })),
        {
          eligiblePlayerIds: onFieldIds,
          mapSlotToPosition: slotToTacticalPosition,
        },
      )

      skipOnFieldSyncRef.current = true
      setSelection(null)
      setSlotAssignments(remap.slotAssignments)
      onFormationSwitch(nextId, remap)
    }

    const isFieldSelected = (slotId: string, playerId: string | null) =>
      selection?.kind === 'field' &&
      selection.slotId === slotId &&
      selection.playerId === playerId

    const isBenchSelected = (playerId: string) =>
      selection?.kind === 'bench' && selection.playerId === playerId

    const showSwapHint = Boolean(selection)

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold uppercase tracking-wide text-neon">
            <Users className="size-5" />
            Live Formation
          </h2>
          <span className="rounded bg-neon/20 px-2 py-0.5 text-xs font-bold text-neon">
            {onFieldPlayers.length}/{maxFieldPlayers} on field
          </span>
        </div>

        <select
          value={formationId}
          onChange={(e) => handleFormationChange(e.target.value)}
          aria-label="Formation"
          className="min-h-11 w-full touch-manipulation rounded-lg border border-border bg-card px-3 py-3 text-sm font-bold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
        >
          {availableFormations.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>

        {showSwapHint ? (
          <div className="rounded-xl border border-neon/40 bg-neon/10 px-4 py-3 text-sm font-semibold text-foreground">
            Selected: <span className="text-neon">{selectionLabel}</span>. Tap another player or
            position to swap.
            {selection?.kind === 'field' && selection.playerId ? (
              <button
                type="button"
                onClick={() => {
                  executeFieldSubOut(selection.playerId!)
                  setSelection(null)
                }}
                className="mt-2 flex min-h-[44px] w-full touch-manipulation items-center justify-center rounded-lg border border-border bg-secondary px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-foreground active:scale-[0.98]"
              >
                Sub off selected player
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Tap a player on the pitch or bench to select, then tap another to swap or reassign.
          </p>
        )}

        <div className={PITCH_BENCH_LAYOUT}>
          <div className="min-w-0">
            <SoccerPitchSurface>
              {formation.slots.map((slot) => {
                const playerId = slotAssignments[slot.id] ?? null
                const player = playerId ? (playerById.get(playerId) ?? null) : null
                const displayPlayer = player?.isOnField ? player : null
                const effectivePlayerId = displayPlayer?.id ?? null
                const selected = isFieldSelected(slot.id, effectivePlayerId)
                const swapTarget = Boolean(selection && !selected)

                return (
                  <div key={slot.id} className="absolute" style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>
                    <LivePitchPlayerBadge
                      player={displayPlayer}
                      displayName={
                        displayPlayer
                          ? getSidelineName(displayPlayer, sidelineNameMap)
                          : slot.label
                      }
                      clockSeconds={clockSeconds}
                      slotLabel={slot.label}
                      selected={selected}
                      swapTarget={swapTarget}
                      flashed={displayPlayer ? flashedPlayerIds.has(displayPlayer.id) : false}
                      onTap={() => handleFieldSlotTap(slot.id)}
                      onSetImpact={
                        onSetImpact && displayPlayer
                          ? (impact) => onSetImpact(displayPlayer.id, impact)
                          : undefined
                      }
                    />
                  </div>
                )
              })}
            </SoccerPitchSurface>
          </div>

          <div className={PITCH_BENCH_SIDEBAR}>
            <div className="rounded-xl border-2 border-dashed border-border bg-secondary/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Bench</h3>
                <span className="text-xs font-semibold text-muted-foreground">
                  {benchPlayers.length} players
                </span>
              </div>

              {benchPlayers.length === 0 ? (
                <p className="py-3 text-center text-sm text-muted-foreground">No bench players</p>
              ) : (
                <ul className="space-y-2">
                  {benchPlayers.map((player) => (
                    <BenchPlayerRow
                      key={player.id}
                      player={player}
                      displayName={getSidelineName(player, sidelineNameMap)}
                      clockSeconds={clockSeconds}
                      selected={isBenchSelected(player.id)}
                      swapTarget={Boolean(selection && !isBenchSelected(player.id))}
                      onTap={() => handleBenchPlayerTap(player.id)}
                      onSetImpact={
                        onSetImpact ? (impact) => onSetImpact(player.id, impact) : undefined
                      }
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  },
)
