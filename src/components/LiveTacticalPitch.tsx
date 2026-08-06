import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Users } from 'lucide-react'
import { SoccerPitchSurface } from '@/components/SoccerPitchSurface'
import {
  FORMATIONS,
  buildAssignmentsFromStarters,
  getFormationById,
  roleToTacticalPosition,
  type FormationSlot,
} from '@/lib/formations'
import { formatPlayingTimeClock, getLiveSecondsPlayed } from '@/lib/play-time'
import { displayMatchPosition, formationRoleToLivePosition } from '@/lib/positions'
import { cn } from '@/lib/utils'
import type { Impact, MatchPlayer } from '@/types/match'

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

const IMPACT_RING: Record<Impact, string> = {
  neutral: 'border-white/70',
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
  onFormationChange: (formationId: string) => void
  onSwap: (benchId: string, fieldId: string, tacticalPosition: string) => void
  onSubIn: (benchId: string, tacticalPosition: string) => void
  onSubOut: (fieldId: string) => void
  onReassignPosition: (updates: PositionReassignUpdate[]) => void
  onSetImpact: (id: string, impact: Impact) => void
}

function ImpactToggleGroup({
  impact,
  onSetImpact,
  compact,
}: {
  impact: Impact
  onSetImpact: (impact: Impact) => void
  compact?: boolean
}) {
  const size = compact ? 'size-5 text-[10px]' : 'size-7 text-xs'
  return (
    <div className="flex shrink-0 gap-0.5" onClick={(e) => e.stopPropagation()}>
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
  clockSeconds,
  slotLabel,
  draggable,
  dropZoneActive,
  dropZoneHover,
  dropZoneSwap,
  flashed,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onSetImpact,
}: {
  player: MatchPlayer | null
  clockSeconds: number
  slotLabel: string
  draggable: boolean
  dropZoneActive: boolean
  dropZoneHover: boolean
  dropZoneSwap: boolean
  flashed: boolean
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onDragEnter: (e: DragEvent) => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onSetImpact: (impact: Impact) => void
}) {
  const liveSeconds = player ? getLiveSecondsPlayed(player, clockSeconds) : 0
  const positionLabel = player ? displayMatchPosition(player.matchPosition) : slotLabel

  return (
    <div
      draggable={draggable && Boolean(player)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-transform duration-150',
        draggable && player && 'cursor-grab active:cursor-grabbing',
        dropZoneHover && 'z-20 scale-110',
        dropZoneActive && !dropZoneHover && 'z-10 scale-105',
      )}
    >
      {player ? (
        <div
          className={cn(
            'flex min-w-[4.75rem] flex-col items-center rounded-2xl border-2 bg-neon px-1 py-1.5 text-neon-foreground shadow-lg transition-all duration-300',
            IMPACT_RING[player.impact],
            flashed && 'animate-pulse ring-4 ring-white/90 brightness-125',
            dropZoneHover && 'ring-4 ring-white/80',
          )}
        >
          <span className="font-display text-base font-black leading-none tabular-nums">
            {formatJersey(player.number)}
          </span>
          <span className="max-w-[4.25rem] truncate text-[9px] font-bold leading-tight">
            {player.name.split(' ')[0]}
          </span>
          <span className="max-w-[4.25rem] truncate text-[8px] font-black uppercase tracking-wide text-neon-foreground/80">
            {positionLabel}
          </span>
          <span className="font-mono text-[9px] font-bold tabular-nums text-neon-foreground/90">
            {formatPlayingTimeClock(liveSeconds)}
          </span>
          <ImpactToggleGroup impact={player.impact} onSetImpact={onSetImpact} compact />
        </div>
      ) : (
        <div
          className={cn(
            'flex size-12 flex-col items-center justify-center rounded-full border-2 border-dashed bg-black/20 text-white/90 backdrop-blur-sm transition-all duration-150',
            dropZoneHover
              ? 'scale-125 border-white bg-white/30 ring-4 ring-white/60'
              : dropZoneActive
                ? dropZoneSwap
                  ? 'border-athletic bg-athletic/25 ring-2 ring-athletic/70'
                  : 'border-white/80 bg-white/15 ring-2 ring-white/40'
                : 'border-white/60',
          )}
        >
          <span className="text-[10px] font-black uppercase">{slotLabel}</span>
        </div>
      )}
    </div>
  )
}

function BenchPlayerRow({
  player,
  clockSeconds,
  onDragStart,
  onSetImpact,
}: {
  player: MatchPlayer
  clockSeconds: number
  onDragStart: (e: DragEvent) => void
  onSetImpact: (impact: Impact) => void
}) {
  const liveSeconds = getLiveSecondsPlayed(player, clockSeconds)

  return (
    <li
      draggable
      onDragStart={onDragStart}
      className="flex cursor-grab items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2 active:cursor-grabbing"
    >
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full border-2 font-display text-lg font-bold tabular-nums',
          IMPACT_RING[player.impact],
          'bg-secondary text-foreground',
        )}
      >
        {formatJersey(player.number)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-sm font-bold text-foreground">{player.name}</span>
          <span className="font-mono text-xs font-bold tabular-nums text-blue-400">
            {formatPlayingTimeClock(liveSeconds)}
          </span>
        </div>
      </div>
      <ImpactToggleGroup impact={player.impact} onSetImpact={onSetImpact} />
    </li>
  )
}

export function LiveTacticalPitch({
  players,
  clockSeconds,
  maxFieldPlayers,
  periodKey,
  formationId,
  onFormationChange,
  onSwap,
  onSubIn,
  onSubOut,
  onReassignPosition,
  onSetImpact,
}: LiveTacticalPitchProps) {
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string | null>>({})
  const [benchDropHighlight, setBenchDropHighlight] = useState(false)
  const [dragSource, setDragSource] = useState<{ from: 'field' | 'bench'; slotId?: string } | null>(
    null,
  )
  const [hoverSlotId, setHoverSlotId] = useState<string | null>(null)
  const [flashedPlayerIds, setFlashedPlayerIds] = useState<Set<string>>(new Set())
  const hydratedKeyRef = useRef<string | null>(null)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const formation = getFormationById(formationId)
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

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (hydratedKeyRef.current === periodKey) return
    hydratedKeyRef.current = periodKey
    const starters = Object.fromEntries(players.map((p) => [p.id, p.attending && p.isOnField]))
    setSlotAssignments(
      buildAssignmentsFromStarters(
        formation,
        players.map((p) => ({ id: p.id, matchPosition: p.matchPosition, position: p.position })),
        starters,
      ),
    )
  }, [periodKey, formation, players])

  useEffect(() => {
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

  const clearDragState = useCallback(() => {
    setDragSource(null)
    setHoverSlotId(null)
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

  const handleDragStart = (
    e: DragEvent,
    playerId: string,
    from: 'field' | 'bench',
    sourceSlotId?: string,
  ) => {
    e.dataTransfer.setData('text/player-id', playerId)
    e.dataTransfer.setData('text/from', from)
    if (sourceSlotId) e.dataTransfer.setData('text/source-slot-id', sourceSlotId)
    e.dataTransfer.effectAllowed = 'move'
    setDragSource(from === 'field' ? { from, slotId: sourceSlotId } : { from })
  }

  const handleSlotDragOver = (e: DragEvent, slotId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragSource?.from === 'field' && dragSource.slotId !== slotId) {
      setHoverSlotId(slotId)
    }
  }

  const handleSlotDragEnter = (e: DragEvent, slotId: string) => {
    e.preventDefault()
    if (dragSource?.from === 'field' && dragSource.slotId !== slotId) {
      setHoverSlotId(slotId)
    }
  }

  const handleSlotDragLeave = (e: DragEvent, slotId: string) => {
    const related = e.relatedTarget as Node | null
    if (related && e.currentTarget.contains(related)) return
    if (hoverSlotId === slotId) setHoverSlotId(null)
  }

  const handleFieldReassign = (
    sourceSlotId: string,
    targetSlot: FormationSlot,
    draggedPlayerId: string,
  ) => {
    const occupantId = slotAssignments[targetSlot.id] ?? null
    const sourceSlot = slotById.get(sourceSlotId)
    if (!sourceSlot) return

    const targetPosition = formationRoleToLivePosition(targetSlot.role)
    const updates: PositionReassignUpdate[] = [
      { playerId: draggedPlayerId, position: targetPosition },
    ]

    if (occupantId && occupantId !== draggedPlayerId) {
      updates.push({
        playerId: occupantId,
        position: formationRoleToLivePosition(sourceSlot.role),
      })
    }

    setSlotAssignments((prev) => ({
      ...prev,
      [sourceSlotId]: occupantId && occupantId !== draggedPlayerId ? occupantId : null,
      [targetSlot.id]: draggedPlayerId,
    }))

    onReassignPosition(updates)
    flashPlayers(updates.map((u) => u.playerId))
  }

  const handleSlotDrop = (e: DragEvent, slot: FormationSlot) => {
    e.preventDefault()
    clearDragState()

    const playerId = e.dataTransfer.getData('text/player-id')
    const from = e.dataTransfer.getData('text/from')
    if (!playerId) return

    if (from === 'field') {
      const sourceSlotId = e.dataTransfer.getData('text/source-slot-id')
      if (!sourceSlotId || sourceSlotId === slot.id) return

      const fieldPlayer = playerById.get(playerId)
      if (!fieldPlayer?.isOnField) return

      handleFieldReassign(sourceSlotId, slot, playerId)
      return
    }

    if (from !== 'bench') return

    const benchPlayer = playerById.get(playerId)
    if (!benchPlayer || benchPlayer.isOnField) return

    const tacticalPosition = roleToTacticalPosition(slot.role)
    const occupantId = slotAssignments[slot.id]

    if (occupantId) {
      onSwap(playerId, occupantId, tacticalPosition)
      setSlotAssignments((prev) => ({ ...prev, [slot.id]: playerId }))
      return
    }

    if (onFieldPlayers.length >= maxFieldPlayers) return

    onSubIn(playerId, tacticalPosition)
    setSlotAssignments((prev) => ({ ...prev, [slot.id]: playerId }))
  }

  const handleBenchDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setBenchDropHighlight(true)
  }

  const handleBenchDragLeave = () => setBenchDropHighlight(false)

  const handleBenchDrop = (e: DragEvent) => {
    e.preventDefault()
    setBenchDropHighlight(false)
    clearDragState()

    const playerId = e.dataTransfer.getData('text/player-id')
    const from = e.dataTransfer.getData('text/from')
    if (!playerId || from !== 'field') return

    const fieldPlayer = playerById.get(playerId)
    if (!fieldPlayer?.isOnField) return

    onSubOut(playerId)
    syncSlotForFieldPlayer(playerId, null)
  }

  const handleFormationChange = (nextId: string) => {
    const nextFormation = getFormationById(nextId)
    const starters = Object.fromEntries(onFieldPlayers.map((p) => [p.id, true]))
    onFormationChange(nextId)
    setSlotAssignments(
      buildAssignmentsFromStarters(
        nextFormation,
        onFieldPlayers.map((p) => ({
          id: p.id,
          matchPosition: p.matchPosition,
          position: p.position,
        })),
        starters,
      ),
    )
  }

  const isFieldDrag = dragSource?.from === 'field'

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
        className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-bold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
      >
        {FORMATIONS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>

      <p className="text-xs text-muted-foreground">
        Drag bench players onto the pitch to sub in. Drag on-field players between slots to
        reassign positions, or to the bench to sub out.
      </p>

      <SoccerPitchSurface>
        {formation.slots.map((slot) => {
          const playerId = slotAssignments[slot.id]
          const player = playerId ? (playerById.get(playerId) ?? null) : null
          const displayPlayer = player?.isOnField ? player : null
          const isSourceSlot = dragSource?.slotId === slot.id
          const isValidDropTarget = isFieldDrag && !isSourceSlot
          const isHovered = hoverSlotId === slot.id
          const hasOccupant = Boolean(displayPlayer)

          return (
            <div key={slot.id} className="absolute" style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>
              <LivePitchPlayerBadge
                player={displayPlayer}
                clockSeconds={clockSeconds}
                slotLabel={slot.label}
                draggable={Boolean(displayPlayer)}
                dropZoneActive={isValidDropTarget}
                dropZoneHover={isValidDropTarget && isHovered}
                dropZoneSwap={isValidDropTarget && hasOccupant}
                flashed={displayPlayer ? flashedPlayerIds.has(displayPlayer.id) : false}
                onDragStart={(e) => {
                  if (displayPlayer) handleDragStart(e, displayPlayer.id, 'field', slot.id)
                }}
                onDragEnd={clearDragState}
                onDragEnter={(e) => handleSlotDragEnter(e, slot.id)}
                onDragOver={(e) => handleSlotDragOver(e, slot.id)}
                onDragLeave={(e) => handleSlotDragLeave(e, slot.id)}
                onDrop={(e) => handleSlotDrop(e, slot)}
                onSetImpact={(impact) => {
                  if (displayPlayer) onSetImpact(displayPlayer.id, impact)
                }}
              />
            </div>
          )
        })}
      </SoccerPitchSurface>

      <div
        onDragOver={handleBenchDragOver}
        onDragLeave={handleBenchDragLeave}
        onDrop={handleBenchDrop}
        className={cn(
          'rounded-xl border-2 border-dashed p-3 transition-colors',
          benchDropHighlight ? 'border-athletic bg-athletic/15' : 'border-border bg-secondary/20',
        )}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Bench</h3>
          <span className="text-xs font-semibold text-muted-foreground">
            {benchPlayers.length} · drop here to sub off
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
                clockSeconds={clockSeconds}
                onDragStart={(e) => handleDragStart(e, player.id, 'bench')}
                onSetImpact={(impact) => onSetImpact(player.id, impact)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
