import { useCallback, useEffect, useMemo, useState, type DragEvent, type MutableRefObject } from 'react'
import { Pencil, Users } from 'lucide-react'
import { SoccerPitchSurface } from '@/components/SoccerPitchSurface'
import {
  FORMATIONS,
  buildAssignmentsFromStarters,
  getFormationById,
  roleToTacticalPosition,
  type Formation,
  type FormationRole,
} from '@/lib/formations'
import { cn } from '@/lib/utils'

export type PitchLineupPlayer = {
  id: string
  name: string
  number: number | null
  isGuest: boolean
  badge?: string
  meta?: string
  matchPosition?: string
}

type TacticalPitchLineupProps = {
  title: string
  players: PitchLineupPlayer[]
  attending: Record<string, boolean>
  starters: Record<string, boolean>
  maxFieldPlayers: number
  onAssignStarter: (playerId: string, role: FormationRole, tacticalPosition: string) => void
  onRemoveStarter: (playerId: string) => void
  onSetAttending?: (playerId: string, attending: boolean) => void
  onEditPlayer?: (playerId: string) => void
  initialFormationId?: string
  formationId?: string
  onFormationChange?: (formationId: string) => void
  hydrateFromStarters?: boolean
  initialSlotAssignments?: Record<string, string | null>
  assignmentsResetKey?: string | number
  assignmentsRef?: MutableRefObject<Record<string, string | null> | null>
}

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

function GuestBadge() {
  return (
    <span className="rounded-full bg-black/30 px-1 py-0.5 text-[8px] font-bold uppercase text-white">
      G
    </span>
  )
}

function PitchSlotBadge({
  slotLabel,
  player,
  selected,
  highlighted,
  onClick,
  onDragOver,
  onDrop,
}: {
  slotLabel: string
  player: PitchLineupPlayer | null
  selected: boolean
  highlighted: boolean
  onClick: () => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        'absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-transform active:scale-95',
        highlighted && 'z-10 scale-110',
      )}
    >
      {player ? (
        <div
          className={cn(
            'flex size-14 flex-col items-center justify-center rounded-full border-2 bg-neon text-neon-foreground shadow-lg',
            selected ? 'border-white ring-2 ring-white/80' : 'border-neon-foreground/30',
          )}
        >
          <span className="font-display text-lg font-black leading-none tabular-nums">
            {formatJersey(player.number)}
          </span>
          <span className="max-w-[52px] truncate text-[9px] font-bold leading-tight">
            {player.name.split(' ')[0]}
          </span>
        </div>
      ) : (
        <div
          className={cn(
            'flex size-12 flex-col items-center justify-center rounded-full border-2 border-dashed bg-black/20 text-white/90 backdrop-blur-sm',
            highlighted ? 'border-white bg-white/20' : 'border-white/60',
          )}
        >
          <span className="text-[10px] font-black uppercase">{slotLabel}</span>
        </div>
      )}
    </button>
  )
}

function PoolPlayerChip({
  player,
  selected,
  onSelect,
  onDragStart,
  onToggleAttending,
  onEdit,
  showAttendingToggle,
}: {
  player: PitchLineupPlayer
  selected: boolean
  onSelect: () => void
  onDragStart: (e: DragEvent) => void
  onToggleAttending?: () => void
  onEdit?: () => void
  showAttendingToggle: boolean
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        'flex items-center gap-2 rounded-xl border bg-card px-2 py-2 transition-colors',
        selected ? 'border-neon ring-2 ring-neon/40' : 'border-border',
      )}
    >
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-neon/50 bg-neon/10 font-display text-sm font-bold tabular-nums text-neon">
          {formatJersey(player.number)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1">
            <span className="truncate text-sm font-bold text-foreground">{player.name}</span>
            {player.isGuest && <GuestBadge />}
          </span>
          {player.badge && (
            <span className="text-[10px] font-semibold text-muted-foreground">{player.badge}</span>
          )}
          {player.meta && <span className="block text-[10px] text-muted-foreground">{player.meta}</span>}
        </span>
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${player.name}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary active:scale-90"
        >
          <Pencil className="size-3.5" />
        </button>
      )}
      {showAttendingToggle && onToggleAttending && (
        <button
          type="button"
          onClick={onToggleAttending}
          className="shrink-0 rounded-md bg-secondary px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground active:scale-95"
        >
          Out
        </button>
      )}
    </div>
  )
}

export function TacticalPitchLineup({
  title,
  players,
  attending,
  starters,
  maxFieldPlayers,
  onAssignStarter,
  onRemoveStarter,
  onSetAttending,
  onEditPlayer,
  initialFormationId = '3-3-2',
  formationId: controlledFormationId,
  onFormationChange,
  hydrateFromStarters = false,
  initialSlotAssignments,
  assignmentsResetKey,
  assignmentsRef,
}: TacticalPitchLineupProps) {
  const [internalFormationId, setInternalFormationId] = useState(initialFormationId)
  const formationId = controlledFormationId ?? internalFormationId
  const setFormationId = useCallback(
    (nextId: string) => {
      onFormationChange?.(nextId)
      if (controlledFormationId === undefined) setInternalFormationId(nextId)
    },
    [controlledFormationId, onFormationChange],
  )
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string | null>>({})
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)

  const formation = getFormationById(formationId)
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])

  const assignedPlayerIds = useMemo(
    () => new Set(Object.values(slotAssignments).filter((id): id is string => Boolean(id))),
    [slotAssignments],
  )

  const starterCount = assignedPlayerIds.size

  const poolPlayers = useMemo(
    () => players.filter((p) => (attending[p.id] ?? true) && !assignedPlayerIds.has(p.id)),
    [players, attending, assignedPlayerIds],
  )

  const absentPlayers = useMemo(
    () => players.filter((p) => attending[p.id] === false),
    [players, attending],
  )

  const resetSlotsForFormation = useCallback((nextFormation: Formation) => {
    setSlotAssignments(Object.fromEntries(nextFormation.slots.map((s) => [s.id, null])))
    setSelectedPlayerId(null)
    setSelectedSlotId(null)
  }, [])

  useEffect(() => {
    if (initialSlotAssignments) {
      setSlotAssignments(initialSlotAssignments)
      setSelectedPlayerId(null)
      setSelectedSlotId(null)
      return
    }

    if (hydrateFromStarters) {
      setSlotAssignments(
        buildAssignmentsFromStarters(
          formation,
          players.map((p) => ({
            id: p.id,
            matchPosition: p.matchPosition ?? p.meta,
            position: p.matchPosition ?? p.meta,
          })),
          starters,
        ),
      )
      return
    }

    setSlotAssignments(Object.fromEntries(formation.slots.map((s) => [s.id, null])))
  }, [
    assignmentsResetKey,
    formation,
    hydrateFromStarters,
    initialSlotAssignments,
    players,
    starters,
  ])

  useEffect(() => {
    if (assignmentsRef) assignmentsRef.current = slotAssignments
  }, [assignmentsRef, slotAssignments])

  const assignPlayerToSlot = useCallback(
    (playerId: string, slotId: string) => {
      const slot = formation.slots.find((s) => s.id === slotId)
      if (!slot) return

      setSlotAssignments((prev) => {
        const next = { ...prev }
        for (const [id, assigned] of Object.entries(next)) {
          if (assigned === playerId) next[id] = null
        }
        const displaced = next[slotId]
        next[slotId] = playerId
        if (displaced && displaced !== playerId) onRemoveStarter(displaced)
        return next
      })

      onAssignStarter(playerId, slot.role, roleToTacticalPosition(slot.role))
      setSelectedPlayerId(null)
      setSelectedSlotId(null)
    },
    [formation.slots, onAssignStarter, onRemoveStarter],
  )

  const removePlayerFromSlot = useCallback(
    (slotId: string) => {
      const playerId = slotAssignments[slotId]
      if (!playerId) return
      setSlotAssignments((prev) => ({ ...prev, [slotId]: null }))
      onRemoveStarter(playerId)
    },
    [slotAssignments, onRemoveStarter],
  )

  const handleSlotClick = (slotId: string) => {
    if (selectedPlayerId) {
      assignPlayerToSlot(selectedPlayerId, slotId)
      return
    }

    if (slotAssignments[slotId]) {
      removePlayerFromSlot(slotId)
      return
    }

    setSelectedSlotId((current) => (current === slotId ? null : slotId))
  }

  const handlePoolSelect = (playerId: string) => {
    if (selectedSlotId) {
      assignPlayerToSlot(playerId, selectedSlotId)
      return
    }
    setSelectedPlayerId((current) => (current === playerId ? null : playerId))
  }

  const handleFormationChange = (nextId: string) => {
    const nextFormation = getFormationById(nextId)
    for (const playerId of assignedPlayerIds) onRemoveStarter(playerId)
    setFormationId(nextId)
    resetSlotsForFormation(nextFormation)
  }

  const markPlayerAbsent = (playerId: string) => {
    const slotEntry = Object.entries(slotAssignments).find(([, id]) => id === playerId)
    if (slotEntry) removePlayerFromSlot(slotEntry[0])
    onSetAttending?.(playerId, false)
  }

  const handleDragStart = (e: DragEvent, playerId: string) => {
    e.dataTransfer.setData('text/player-id', playerId)
    e.dataTransfer.effectAllowed = 'move'
    setSelectedPlayerId(playerId)
  }

  const handleSlotDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleSlotDrop = (e: DragEvent, slotId: string) => {
    e.preventDefault()
    const playerId = e.dataTransfer.getData('text/player-id')
    if (playerId) assignPlayerToSlot(playerId, slotId)
  }

  return (
    <section aria-label={title} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold uppercase tracking-wide text-foreground">
          <Users className="size-5 text-athletic" />
          {title}
        </h2>
        <span
          className={cn(
            'rounded px-2 py-0.5 text-xs font-bold',
            starterCount > maxFieldPlayers ? 'bg-danger/20 text-danger' : 'bg-secondary text-muted-foreground',
          )}
        >
          On field {starterCount}/{maxFieldPlayers}
        </span>
      </div>

      <div>
        <label
          htmlFor="formation-select"
          className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
        >
          Formation
        </label>
        <select
          id="formation-select"
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
      </div>

      <p className="text-xs text-muted-foreground">
        Tap a player, then tap a position — or drag from the bench onto the pitch.
      </p>

      <SoccerPitchSurface>
        {formation.slots.map((slot) => {
          const playerId = slotAssignments[slot.id]
          const player = playerId ? (playerById.get(playerId) ?? null) : null
          const highlighted = Boolean(selectedPlayerId) || selectedSlotId === slot.id

          return (
            <div key={slot.id} className="absolute" style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>
              <PitchSlotBadge
                slotLabel={slot.label}
                player={player}
                selected={playerId === selectedPlayerId}
                highlighted={highlighted}
                onClick={() => handleSlotClick(slot.id)}
                onDragOver={handleSlotDragOver}
                onDrop={(e) => handleSlotDrop(e, slot.id)}
              />
            </div>
          )
        })}
      </SoccerPitchSurface>

      <div className="rounded-xl border border-border bg-secondary/20 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">Bench / Unassigned</h3>
          <span className="text-xs font-semibold text-muted-foreground">{poolPlayers.length} players</span>
        </div>
        {poolPlayers.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">All attending players are on the pitch</p>
        ) : (
          <ul className="space-y-2">
            {poolPlayers.map((player) => (
              <li key={player.id}>
                <PoolPlayerChip
                  player={player}
                  selected={selectedPlayerId === player.id}
                  onSelect={() => handlePoolSelect(player.id)}
                  onDragStart={(e) => handleDragStart(e, player.id)}
                  onToggleAttending={
                    onSetAttending ? () => markPlayerAbsent(player.id) : undefined
                  }
                  onEdit={onEditPlayer ? () => onEditPlayer(player.id) : undefined}
                  showAttendingToggle={Boolean(onSetAttending)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {absentPlayers.length > 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-3">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Not Attending</h3>
          <ul className="space-y-2">
            {absentPlayers.map((player) => (
              <li key={player.id}>
                <PoolPlayerChip
                  player={player}
                  selected={false}
                  onSelect={() => onSetAttending?.(player.id, true)}
                  onDragStart={(e) => handleDragStart(e, player.id)}
                  showAttendingToggle={false}
                />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-muted-foreground">Tap a player to mark them attending again.</p>
        </div>
      )}
    </section>
  )
}
