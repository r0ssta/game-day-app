import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from 'react'
import { Pencil, Users } from 'lucide-react'
import {
  FormationDraggableHandle,
  FormationPitch,
} from '@/components/FormationPitch'
import {
  buildAssignmentsFromStarters,
  getDefaultFormationId,
  getFormationById,
  getFormationsForFormat,
  remapFormationSlotAssignments,
  resolveSlotLabel,
  type FormationRole,
} from '@/lib/formations'
import type { TeamFormat } from '@/lib/team-format'
import {
  ROSTER_POSITION_HINT_CLASS,
  isRosterProfilePosition,
  rosterPositionAbbrev,
} from '@/lib/positions'
import { cn } from '@/lib/utils'
import {
  PITCH_BENCH_LAYOUT,
  PITCH_BENCH_LAYOUT_FLOW,
  PITCH_BENCH_SIDEBAR,
  PITCH_BENCH_SIDEBAR_FLOW,
  TOUCH_ICON_BUTTON,
  TOUCH_ROW,
} from '@/lib/layout'

export type PitchLineupPlayer = {
  id: string
  name: string
  /** Sideline-style label for pitch slots; defaults to `name`. */
  shortName?: string
  number: number | null
  isGuest: boolean
  badge?: string
  meta?: string
  /** 1st-half minutes played — shown next to the player name at halftime. */
  minutesLabel?: string
  matchPosition?: string
  primaryPosition?: string
  secondaryPosition?: string
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
  /** Restored coach positional label overrides when loading a saved preset. */
  initialSlotLabelOverrides?: Record<string, string>
  assignmentsResetKey?: string | number
  assignmentsRef?: MutableRefObject<Record<string, string | null> | null>
  /** Optional ref for coach positional label overrides (setup → match tracking). */
  slotLabelOverridesRef?: MutableRefObject<Record<string, string> | null>
  teamFormat?: TeamFormat
  /**
   * When false, bench/absent lists grow naturally so a parent page can be the only scroller.
   * Default true keeps inner list scroll for filled-height shells.
   */
  constrainLists?: boolean
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

function RosterPositionHint({
  position,
  variant,
}: {
  position: string
  variant: 'primary' | 'secondary'
}) {
  const abbrev = rosterPositionAbbrev(position)
  const colorClass = isRosterProfilePosition(position)
    ? ROSTER_POSITION_HINT_CLASS[position]
    : 'bg-secondary text-muted-foreground ring-border'

  return (
    <span
      title={`${variant === 'primary' ? 'Primary' : 'Secondary'}: ${position}`}
      className={cn(
        'inline-flex items-center rounded px-1 py-0.5 text-[9px] font-black uppercase tabular-nums ring-1',
        colorClass,
        variant === 'secondary' && 'opacity-75',
      )}
    >
      {abbrev}
    </span>
  )
}

function PoolPlayerChip({
  player,
  selected,
  onSelect,
  onToggleAttending,
  onEdit,
  showAttendingToggle,
  enableDrag,
}: {
  player: PitchLineupPlayer
  selected: boolean
  onSelect: () => void
  onToggleAttending?: () => void
  onEdit?: () => void
  showAttendingToggle: boolean
  enableDrag: boolean
}) {
  return (
    <div
      className={cn(
        'flex touch-pan-y items-center gap-2 rounded-xl border bg-card px-2 py-2 transition-colors',
        selected ? 'border-neon ring-2 ring-neon/40' : 'border-border',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className={`flex min-w-0 flex-1 items-center gap-2 text-left ${TOUCH_ROW}`}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-neon/50 bg-neon/10 font-display text-sm font-bold tabular-nums text-neon">
          {formatJersey(player.number)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1">
            <span className="truncate text-sm font-bold text-foreground">{player.name}</span>
            {player.minutesLabel ? (
              <span className="font-mono text-xs font-black tabular-nums text-slate-700">
                {player.minutesLabel}
              </span>
            ) : null}
            {player.isGuest && <GuestBadge />}
            {player.primaryPosition && (
              <RosterPositionHint position={player.primaryPosition} variant="primary" />
            )}
            {player.secondaryPosition &&
              player.secondaryPosition !== player.primaryPosition && (
                <RosterPositionHint position={player.secondaryPosition} variant="secondary" />
              )}
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
          className={`${TOUCH_ICON_BUTTON} bg-secondary`}
        >
          <Pencil className="size-3.5" />
        </button>
      )}
      {enableDrag ? <FormationDraggableHandle playerId={player.id} /> : null}
      {showAttendingToggle && onToggleAttending && (
        <button
          type="button"
          onClick={onToggleAttending}
          className={`${TOUCH_ROW} shrink-0 rounded-md border-2 border-border bg-secondary px-3 text-[10px] font-bold uppercase tracking-wide text-foreground active:scale-95`}
        >
          Absent
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
  initialSlotLabelOverrides,
  assignmentsResetKey,
  assignmentsRef,
  slotLabelOverridesRef,
  teamFormat,
  constrainLists = true,
}: TacticalPitchLineupProps) {
  const availableFormations = useMemo(
    () => (teamFormat ? getFormationsForFormat(teamFormat) : getFormationsForFormat('9v9')),
    [teamFormat],
  )
  const defaultFormationId = teamFormat ? getDefaultFormationId(teamFormat) : initialFormationId
  const [internalFormationId, setInternalFormationId] = useState(defaultFormationId)
  const formationId = controlledFormationId ?? internalFormationId
  const setFormationId = useCallback(
    (nextId: string) => {
      onFormationChange?.(nextId)
      if (controlledFormationId === undefined) setInternalFormationId(nextId)
    },
    [controlledFormationId, onFormationChange],
  )
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string | null>>({})
  const [slotLabelOverrides, setSlotLabelOverrides] = useState<Record<string, string>>({})
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)

  const formation = getFormationById(formationId, teamFormat)

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

  const pitchPlayers = useMemo(
    () =>
      players.map((p) => ({
        id: p.id,
        name: p.name,
        shortName: p.shortName,
        number: p.number,
        isGuest: p.isGuest,
        minutesLabel: p.minutesLabel,
      })),
    [players],
  )

  useEffect(() => {
    if (!teamFormat) return
    if (!availableFormations.some((entry) => entry.id === formationId)) {
      setFormationId(getDefaultFormationId(teamFormat))
    }
  }, [availableFormations, formationId, setFormationId, teamFormat])

  useEffect(() => {
    const restoredOverrides = initialSlotLabelOverrides ?? {}
    if (initialSlotAssignments) {
      setSlotAssignments(initialSlotAssignments)
      setSlotLabelOverrides(restoredOverrides)
      setSelectedPlayerId(null)
      setSelectedSlotId(null)

      const assignedIds = new Set(
        Object.values(initialSlotAssignments).filter((id): id is string => Boolean(id)),
      )
      for (const player of players) {
        if (attending[player.id] === false) continue
        if (assignedIds.has(player.id)) {
          const slotId = Object.entries(initialSlotAssignments).find(([, id]) => id === player.id)?.[0]
          const slot = formation.slots.find((s) => s.id === slotId)
          if (slot) {
            onAssignStarter(player.id, slot.role, resolveSlotLabel(slot, restoredOverrides))
          }
        } else {
          onRemoveStarter(player.id)
        }
      }
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
      setSlotLabelOverrides(restoredOverrides)
      return
    }

    setSlotAssignments(Object.fromEntries(formation.slots.map((s) => [s.id, null])))
    setSlotLabelOverrides({})
    // Only re-hydrate when parent explicitly bumps assignmentsResetKey (load preset, reset editor).
    // Do not depend on `players`, `starters`, or `formation` — those change on every assign/render
    // and were wiping drag-and-drop / tap assignments immediately after placement.
  }, [assignmentsResetKey])

  useEffect(() => {
    if (assignmentsRef) assignmentsRef.current = slotAssignments
  }, [assignmentsRef, slotAssignments])

  useEffect(() => {
    if (slotLabelOverridesRef) slotLabelOverridesRef.current = slotLabelOverrides
  }, [slotLabelOverridesRef, slotLabelOverrides])

  // Drop absent players from pitch slots when attendance flips outside this component.
  useEffect(() => {
    setSlotAssignments((prev) => {
      let changed = false
      const next = { ...prev }
      for (const [slotId, playerId] of Object.entries(prev)) {
        if (playerId && attending[playerId] === false) {
          next[slotId] = null
          changed = true
          onRemoveStarter(playerId)
        }
      }
      return changed ? next : prev
    })
  }, [attending, onRemoveStarter])

  const assignPlayerToSlot = useCallback(
    (playerId: string, slotId: string) => {
      const slot = formation.slots.find((s) => s.id === slotId)
      if (!slot) return

      const isReplacing = Boolean(slotAssignments[slotId])
      if (!isReplacing && assignedPlayerIds.size >= maxFieldPlayers) return

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

      onAssignStarter(playerId, slot.role, resolveSlotLabel(slot, slotLabelOverrides))
      setSelectedPlayerId(null)
      setSelectedSlotId(null)
    },
    [
      formation.slots,
      onAssignStarter,
      onRemoveStarter,
      assignedPlayerIds.size,
      maxFieldPlayers,
      slotAssignments,
      slotLabelOverrides,
    ],
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

  const handleSlotLabelChange = (slotId: string, label: string) => {
    setSlotLabelOverrides((prev) => ({ ...prev, [slotId]: label }))
    const playerId = slotAssignments[slotId]
    if (!playerId) return
    const slot = formation.slots.find((s) => s.id === slotId)
    if (!slot) return
    onAssignStarter(playerId, slot.role, label.trim().toUpperCase())
  }

  const handleFormationChange = (nextId: string) => {
    if (nextId === formationId) return
    if (teamFormat && !availableFormations.some((entry) => entry.id === nextId)) return

    const nextFormation = getFormationById(nextId, teamFormat)
    const remap = remapFormationSlotAssignments(
      slotAssignments,
      nextFormation,
      players.map((p) => ({
        id: p.id,
        matchPosition: p.matchPosition ?? p.meta,
        position: p.primaryPosition,
      })),
      {
        mapSlotToPosition: (slot) => resolveSlotLabel(slot, slotLabelOverrides),
      },
    )

    for (const playerId of assignedPlayerIds) {
      const stillAssigned = Object.values(remap.slotAssignments).includes(playerId)
      if (!stillAssigned) onRemoveStarter(playerId)
    }

    for (const [slotId, playerId] of Object.entries(remap.slotAssignments)) {
      if (!playerId) continue
      const slot = nextFormation.slots.find((s) => s.id === slotId)
      if (!slot) continue
      onAssignStarter(playerId, slot.role, resolveSlotLabel(slot, slotLabelOverrides))
    }

    setFormationId(nextId)
    setSlotAssignments(remap.slotAssignments)
    // Drop overrides for slots that no longer exist on the new formation.
    setSlotLabelOverrides((prev) => {
      const next: Record<string, string> = {}
      for (const slot of nextFormation.slots) {
        if (prev[slot.id]) next[slot.id] = prev[slot.id]
      }
      return next
    })
    setSelectedPlayerId(null)
    setSelectedSlotId(null)
  }

  const markPlayerAbsent = (playerId: string) => {
    const slotEntry = Object.entries(slotAssignments).find(([, id]) => id === playerId)
    if (slotEntry) removePlayerFromSlot(slotEntry[0])
    onSetAttending?.(playerId, false)
  }

  return (
    <section
      aria-label={title}
      className={cn(
        'flex flex-col gap-3',
        constrainLists ? 'min-h-0 flex-1 overflow-hidden' : undefined,
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
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

      <div className="shrink-0">
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
          className="min-h-11 w-full touch-manipulation rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-bold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
        >
          {availableFormations.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <p className="shrink-0 text-xs text-muted-foreground">
        Pick a base formation, then drag players (or empty slots) on the pitch to fine-tune their
        positions. Drag from the bench to fill a slot, or tap to assign / remove. Tap the position
        chip under a slot (pencil) to rename it.
      </p>

      <FormationPitch
        formation={formation}
        slotAssignments={slotAssignments}
        players={pitchPlayers}
        slotLabelOverrides={slotLabelOverrides}
        selectedPlayerId={selectedPlayerId}
        selectedSlotId={selectedSlotId}
        onAssignPlayer={assignPlayerToSlot}
        onSlotTap={handleSlotClick}
        onSlotLabelChange={handleSlotLabelChange}
        enableDragDrop
        className={constrainLists ? PITCH_BENCH_LAYOUT : PITCH_BENCH_LAYOUT_FLOW}
      >
        <div className={constrainLists ? PITCH_BENCH_SIDEBAR : PITCH_BENCH_SIDEBAR_FLOW}>
          <div
            className={cn(
              'rounded-xl border border-border bg-secondary/20 p-3',
              constrainLists && 'flex min-h-0 flex-1 flex-col overflow-hidden',
            )}
          >
            <div className="mb-2 flex shrink-0 items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wide text-foreground">
                Bench / Unassigned
              </h3>
              <span className="text-xs font-semibold text-muted-foreground">
                {poolPlayers.length} players
              </span>
            </div>
            {poolPlayers.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">
                All attending players are on the pitch
              </p>
            ) : (
              <ul
                className={cn(
                  'space-y-2',
                  constrainLists && 'min-h-0 flex-1 overflow-y-auto overscroll-contain',
                )}
              >
                {poolPlayers.map((player) => (
                  <li key={player.id}>
                    <PoolPlayerChip
                      player={player}
                      selected={selectedPlayerId === player.id}
                      onSelect={() => handlePoolSelect(player.id)}
                      onToggleAttending={
                        onSetAttending ? () => markPlayerAbsent(player.id) : undefined
                      }
                      onEdit={onEditPlayer ? () => onEditPlayer(player.id) : undefined}
                      showAttendingToggle={Boolean(onSetAttending)}
                      enableDrag
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {absentPlayers.length > 0 && (
            <div
              className={cn(
                'rounded-xl border border-dashed border-border bg-card/50 p-3',
                constrainLists && 'flex max-h-[40%] min-h-0 flex-col overflow-hidden',
              )}
            >
              <h3 className="mb-2 shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Absent
              </h3>
              <ul
                className={cn(
                  'space-y-2',
                  constrainLists && 'min-h-0 flex-1 overflow-y-auto overscroll-contain',
                )}
              >
                {absentPlayers.map((player) => (
                  <li key={player.id}>
                    <PoolPlayerChip
                      player={player}
                      selected={false}
                      onSelect={() => onSetAttending?.(player.id, true)}
                      showAttendingToggle={false}
                      enableDrag={false}
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-2 shrink-0 text-[10px] text-muted-foreground">
                Tap a player to mark them Attending again. Absent players stay out of lineup, bench,
                and post-game recap.
              </p>
            </div>
          )}
        </div>
      </FormationPitch>
    </section>
  )
}
