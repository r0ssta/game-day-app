import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Users, X } from 'lucide-react'
import { FormationPitch } from '@/components/FormationPitch'
import {
  buildAssignmentsFromStarters,
  getFormationById,
  getFormationsForFormat,
  remapFormationSlotAssignments,
  resolveSlotLabel,
  type FormationRemapResult,
} from '@/lib/formations'
import type { TeamFormat } from '@/lib/team-format'
import {
  buildSidelineNameMap,
  formatPlayerLabel,
  getSidelineName,
} from '@/lib/player-names'
import { formatPlayingTimeClock, getLiveSecondsPlayed } from '@/lib/play-time'
import { cn } from '@/lib/utils'
import { PITCH_BENCH_LAYOUT_FLOW, PITCH_BENCH_SIDEBAR_FLOW } from '@/lib/layout'
import type { Impact, MatchPlayer } from '@/types/match'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

const IMPACT_RING: Record<Impact, string> = {
  neutral: 'border-border',
  positive: 'border-neon ring-2 ring-neon/50',
  negative: 'border-danger ring-2 ring-danger/50',
}

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

type SubSheetState =
  | { mode: 'substitute'; slotId: string; fieldPlayerId: string }
  | { mode: 'insert'; slotId: string }

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

function BenchPlayerRow({
  player,
  displayName,
  clockSeconds,
  onTap,
  onSetImpact,
  actionLabel,
}: {
  player: MatchPlayer
  displayName: string
  clockSeconds: number
  onTap?: () => void
  onSetImpact?: (impact: Impact) => void
  actionLabel?: string
}) {
  const liveSeconds = getLiveSecondsPlayed(player, clockSeconds)
  const interactive = Boolean(onTap)

  const body = (
    <>
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
        {actionLabel ? (
          <span className="text-[10px] font-bold uppercase tracking-wide text-athletic">
            {actionLabel}
          </span>
        ) : null}
      </div>
      {onSetImpact && (
        <ImpactToggleGroup impact={player.impact} onSetImpact={onSetImpact} compact />
      )}
    </>
  )

  if (!interactive) {
    return (
      <li>
        <div className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border-2 border-border bg-card px-3 py-3">
          {body}
        </div>
      </li>
    )
  }

  return (
    <li>
      <button
        type="button"
        onClick={onTap}
        className="flex min-h-[52px] w-full touch-pan-y items-center gap-3 rounded-xl border-2 border-border bg-card px-3 py-3 text-left active:scale-[0.98] active:border-athletic"
      >
        {body}
      </button>
    </li>
  )
}

function SubstituteSheet({
  title,
  benchPlayers,
  sidelineNameMap,
  clockSeconds,
  onPickBench,
  onRemove,
  onClose,
}: {
  title: string
  benchPlayers: MatchPlayer[]
  sidelineNameMap: Map<string, string>
  clockSeconds: number
  onPickBench: (benchPlayerId: string) => void
  onRemove?: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h3 className="font-display text-lg font-bold uppercase tracking-wide text-foreground">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-lg bg-secondary text-foreground active:scale-95"
            aria-label="Close substitute sheet"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="flex min-h-12 w-full touch-manipulation items-center justify-center rounded-xl border-2 border-danger/40 bg-danger/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-danger active:scale-[0.98]"
            >
              Remove Player (Leave Slot Empty)
            </button>
          ) : null}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Bench
              </h4>
              <span className="text-xs font-semibold text-muted-foreground">
                {benchPlayers.length}
              </span>
            </div>
            {benchPlayers.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No bench players</p>
            ) : (
              <ul className="space-y-2">
                {benchPlayers.map((player) => (
                  <BenchPlayerRow
                    key={player.id}
                    player={player}
                    displayName={getSidelineName(player, sidelineNameMap)}
                    clockSeconds={clockSeconds}
                    onTap={() => onPickBench(player.id)}
                    actionLabel={onRemove ? 'Swap in' : 'Insert'}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
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
      onReassignPosition: _onReassignPosition,
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
    const [slotLabelOverrides, setSlotLabelOverrides] = useState<Record<string, string>>({})
    const slotAssignmentsRef = useRef(slotAssignments)
    slotAssignmentsRef.current = slotAssignments

    useImperativeHandle(ref, () => ({
      getSlotAssignments: () => slotAssignmentsRef.current,
    }))

    const [sheet, setSheet] = useState<SubSheetState | null>(null)
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

    const pitchPlayers = useMemo(
      () =>
        players.map((p) => ({
          id: p.id,
          name: getSidelineName(p, sidelineNameMap),
          shortName: getSidelineName(p, sidelineNameMap),
          number: p.number,
          minutesLabel: formatPlayingTimeClock(getLiveSecondsPlayed(p, clockSeconds)),
        })),
      [players, sidelineNameMap, clockSeconds],
    )

    useEffect(() => {
      return () => {
        if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
      }
    }, [])

    useEffect(() => {
      setSheet(null)
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

    // Only show on-field occupants on the pitch; empty gaps stay clickable for insert.
    const displaySlotAssignments = useMemo(() => {
      const next: Record<string, string | null> = { ...slotAssignments }
      for (const [slotId, playerId] of Object.entries(next)) {
        if (!playerId) continue
        const player = playerById.get(playerId)
        if (!player?.isOnField) next[slotId] = null
      }
      return next
    }, [slotAssignments, playerById])

    const flashPlayers = useCallback((playerIds: string[]) => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
      setFlashedPlayerIds(new Set(playerIds))
      flashTimeoutRef.current = setTimeout(() => setFlashedPlayerIds(new Set()), 700)
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

    const slotPosition = useCallback(
      (slotId: string) => {
        const slot = slotById.get(slotId)
        if (!slot) return 'UTIL'
        return resolveSlotLabel(slot, slotLabelOverrides)
      },
      [slotById, slotLabelOverrides],
    )

    const handleSlotTap = useCallback(
      (slotId: string) => {
        const fieldPlayerId = getOnFieldPlayerAtSlot(slotId)
        if (fieldPlayerId) {
          setSheet({ mode: 'substitute', slotId, fieldPlayerId })
          return
        }
        // Empty slot stays clickable so coach can insert later (play down a man).
        setSheet({ mode: 'insert', slotId })
      },
      [getOnFieldPlayerAtSlot],
    )

    const closeSheet = useCallback(() => setSheet(null), [])

    const handlePickBench = useCallback(
      (benchPlayerId: string) => {
        if (!sheet) return
        const tacticalPosition = slotPosition(sheet.slotId)
        const benchPlayer = playerById.get(benchPlayerId)
        if (!benchPlayer || benchPlayer.isOnField) return

        if (sheet.mode === 'substitute') {
          onSwap(benchPlayerId, sheet.fieldPlayerId, tacticalPosition)
          setSlotAssignments((prev) => ({ ...prev, [sheet.slotId]: benchPlayerId }))
          flashPlayers([benchPlayerId, sheet.fieldPlayerId])
          setSheet(null)
          return
        }

        if (onFieldPlayers.length >= maxFieldPlayers) return
        onSubIn(benchPlayerId, tacticalPosition)
        setSlotAssignments((prev) => ({ ...prev, [sheet.slotId]: benchPlayerId }))
        flashPlayers([benchPlayerId])
        setSheet(null)
      },
      [
        sheet,
        slotPosition,
        playerById,
        onSwap,
        onSubIn,
        onFieldPlayers.length,
        maxFieldPlayers,
        flashPlayers,
      ],
    )

    const handleRemovePlayer = useCallback(() => {
      if (!sheet || sheet.mode !== 'substitute') return
      onSubOut(sheet.fieldPlayerId)
      setSlotAssignments((prev) => ({ ...prev, [sheet.slotId]: null }))
      flashPlayers([sheet.fieldPlayerId])
      setSheet(null)
    }, [sheet, onSubOut, flashPlayers])

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
          mapSlotToPosition: (slot) => resolveSlotLabel(slot, slotLabelOverrides),
        },
      )

      skipOnFieldSyncRef.current = true
      setSheet(null)
      setSlotAssignments(remap.slotAssignments)
      setSlotLabelOverrides((prev) => {
        const next: Record<string, string> = {}
        for (const slot of nextFormation.slots) {
          if (prev[slot.id]) next[slot.id] = prev[slot.id]
        }
        return next
      })
      onFormationSwitch(nextId, remap)
    }

    const sheetTitle = useMemo(() => {
      if (!sheet) return ''
      if (sheet.mode === 'substitute') {
        const player = playerById.get(sheet.fieldPlayerId)
        const name = player ? formatPlayerLabel(player, sidelineNameMap) : 'Player'
        return `Substitute ${name}`
      }
      const slot = slotById.get(sheet.slotId)
      const label = slot ? resolveSlotLabel(slot, slotLabelOverrides) : 'Slot'
      return `Insert into ${label}`
    }, [sheet, playerById, sidelineNameMap, slotById, slotLabelOverrides])

    // Highlight flashed players via selectedPlayerId on FormationPitch.
    const flashedId = flashedPlayerIds.size === 1 ? [...flashedPlayerIds][0] : null

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

        <p className="text-sm text-muted-foreground">
          Tap a player to substitute, or tap an empty slot to insert. Drag is disabled during live
          play.
        </p>

        <FormationPitch
          formation={formation}
          slotAssignments={displaySlotAssignments}
          players={pitchPlayers}
          slotLabelOverrides={slotLabelOverrides}
          selectedPlayerId={flashedId}
          onAssignPlayer={() => {
            /* DnD disabled in live mode */
          }}
          onSlotTap={handleSlotTap}
          enableDragDrop={false}
          pulseInteractive
          renderOccupiedExtra={
            onSetImpact
              ? (playerId) => {
                  const player = playerById.get(playerId)
                  if (!player?.isOnField) return null
                  return (
                    <ImpactToggleGroup
                      impact={player.impact}
                      onSetImpact={(impact) => onSetImpact(player.id, impact)}
                      compact
                    />
                  )
                }
              : undefined
          }
          className={PITCH_BENCH_LAYOUT_FLOW}
        >
          <div className={PITCH_BENCH_SIDEBAR_FLOW}>
            <div className="rounded-xl border-2 border-dashed border-border bg-secondary/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  Bench
                </h3>
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
                      onSetImpact={
                        onSetImpact ? (impact) => onSetImpact(player.id, impact) : undefined
                      }
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </FormationPitch>

        {sheet ? (
          <SubstituteSheet
            title={sheetTitle}
            benchPlayers={benchPlayers}
            sidelineNameMap={sidelineNameMap}
            clockSeconds={clockSeconds}
            onPickBench={handlePickBench}
            onRemove={sheet.mode === 'substitute' ? handleRemovePlayer : undefined}
            onClose={closeSheet}
          />
        ) : null}
      </div>
    )
  },
)
