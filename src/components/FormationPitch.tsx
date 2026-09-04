import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, X } from 'lucide-react'
import { SoccerPitchSurface } from '@/components/SoccerPitchSurface'
import {
  TACTICAL_SLOT_LABELS,
  resolveSlotLabel,
  type Formation,
  type FormationSlot,
} from '@/lib/formations'
import { MODAL_OVERLAY } from '@/lib/layout'
import { cn } from '@/lib/utils'

export type FormationPitchPlayer = {
  id: string
  name: string
  shortName?: string
  number: number | null
  isGuest?: boolean
  /** Optional second-line label under the name (e.g. minutes at halftime). */
  minutesLabel?: string
  /** Single yellow card indicator on the pitch badge. */
  showYellowCard?: boolean
  /** Soft cue that the player is due for a sub (long continuous stint). */
  needsSubCue?: boolean
  /** Intermission cue: player was not in the 1st-half starting XI. */
  didNotStartFirstHalf?: boolean
}

type DragType = 'player' | 'slot'

type FormationPitchProps = {
  formation: Formation
  slotAssignments: Record<string, string | null>
  players: FormationPitchPlayer[]
  slotLabelOverrides?: Record<string, string>
  selectedPlayerId?: string | null
  selectedSlotId?: string | null
  onAssignPlayer: (playerId: string, slotId: string) => void
  onSlotTap?: (slotId: string) => void
  onSlotLabelChange?: (slotId: string, label: string) => void
  /** Optional content under an occupied slot badge (e.g. live impact toggles). */
  renderOccupiedExtra?: (playerId: string) => ReactNode
  /**
   * When false, skips DnD entirely (live match) — slots are fixed, no reposition handles.
   * Default true (setup / halftime).
   */
  enableDragDrop?: boolean
  /**
   * Content rendered beside/under the pitch, inside the DnD context when enabled.
   * Use this for custom bench UIs (attendance, edit, impact, etc.).
   */
  children?: ReactNode
  className?: string
}

function formatJersey(number: number | null) {
  return number !== null ? String(number) : '—'
}

function cloneFormationSlots(slots: FormationSlot[]): FormationSlot[] {
  return slots.map((slot) => ({ ...slot }))
}

function clampPercent(value: number, min = 6, max = 94) {
  return Math.min(max, Math.max(min, value))
}

/** Bottom-third slots: put labels/extras above so they stay tappable above the match footer. */
function isBottomPitchSlot(y: number) {
  return y >= 72
}

function SlotLabelSheet({
  slotId,
  currentLabel,
  onSelect,
  onClose,
}: {
  slotId: string
  currentLabel: string
  onSelect: (label: string) => void
  onClose: () => void
}) {
  return (
    <div className={MODAL_OVERLAY} onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Change position for ${slotId}`}
        className="relative z-10 flex max-h-[70vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Position label
            </p>
            <h3 className="font-display text-lg font-bold uppercase tracking-wide text-foreground">
              Rename slot
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-lg bg-secondary text-foreground active:scale-95"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {TACTICAL_SLOT_LABELS.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  onSelect(label)
                  onClose()
                }}
                className={cn(
                  'flex min-h-12 touch-manipulation items-center justify-center rounded-xl border-2 px-2 text-sm font-black uppercase active:scale-[0.98]',
                  label === currentLabel
                    ? 'border-neon bg-neon text-neon-foreground'
                    : 'border-border bg-card text-foreground active:bg-secondary',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function PitchSlotVisual({
  slot,
  label,
  player,
  selected,
  highlighted,
  allowLabelEdit,
  allowSlotReposition,
  dropHighlight,
  setDroppableRef,
  setRepositionRef,
  repositionListeners,
  repositionAttributes,
  slotDragStyle,
  isSlotDragging,
  occupiedExtra,
  onOpenLabelEditor,
  onTap,
}: {
  slot: FormationSlot
  label: string
  player: FormationPitchPlayer | null
  selected: boolean
  highlighted: boolean
  allowLabelEdit: boolean
  allowSlotReposition: boolean
  labelEditorOpen?: boolean
  dropHighlight?: boolean
  setDroppableRef?: (node: HTMLElement | null) => void
  /** Draggable node for free repositioning (player badge or empty slot). */
  setRepositionRef?: (node: HTMLElement | null) => void
  repositionListeners?: ReturnType<typeof useDraggable>['listeners']
  repositionAttributes?: ReturnType<typeof useDraggable>['attributes']
  slotDragStyle?: CSSProperties
  isSlotDragging?: boolean
  occupiedExtra?: ReactNode
  onOpenLabelEditor: () => void
  onCloseLabelEditor?: () => void
  onLabelChange?: (label: string) => void
  onTap: () => void
}) {
  const chromeAbove = isBottomPitchSlot(slot.y)
  const chromePositionClass = chromeAbove
    ? 'absolute left-1/2 bottom-full mb-1 -translate-x-1/2'
    : 'absolute left-1/2 top-full mt-1 -translate-x-1/2'

  return (
    <div
      ref={setDroppableRef}
      className={cn('absolute', isSlotDragging && 'z-30 opacity-90')}
      style={{
        left: `${slot.x}%`,
        top: `${slot.y}%`,
        ...slotDragStyle,
      }}
    >
      <div className="relative -translate-x-1/2 -translate-y-1/2">
        {/*
          Setup: the badge itself is the reposition drag source (with activation distance so
          tap-to-assign/remove still works). Live: no listeners — fixed formation shape.
        */}
        <button
          ref={allowSlotReposition ? setRepositionRef : undefined}
          type="button"
          onClick={onTap}
          className={cn(
            'flex min-h-11 min-w-11 flex-col items-center transition-transform active:scale-95',
            allowSlotReposition ? 'touch-none cursor-grab active:cursor-grabbing' : 'touch-pan-y',
            highlighted && 'z-10 scale-110',
            dropHighlight && 'scale-110',
            isSlotDragging && 'ring-2 ring-athletic ring-offset-2 ring-offset-transparent',
          )}
          aria-label={
            allowSlotReposition
              ? player
                ? `Move ${player.shortName ?? player.name} on pitch`
                : `Move ${label} slot`
              : undefined
          }
          {...(allowSlotReposition ? (repositionListeners ?? {}) : {})}
          {...(allowSlotReposition ? (repositionAttributes ?? {}) : {})}
        >
          {player ? (
            <div
              className={cn(
                'relative flex h-16 w-[4.25rem] flex-col items-center justify-center rounded-2xl border-2 px-0.5 py-0.5 shadow-lg',
                player.needsSubCue
                  ? 'border-amber-500 bg-amber-300 text-slate-900 ring-2 ring-amber-400/45'
                  : 'bg-neon text-neon-foreground',
                !player.needsSubCue &&
                  (selected ? 'border-white ring-2 ring-white/80' : 'border-neon-foreground/30'),
                player.needsSubCue && selected && 'ring-4 ring-white/70',
                player.didNotStartFirstHalf &&
                  !player.needsSubCue &&
                  'ring-2 ring-amber-300 ring-offset-1 ring-offset-transparent',
                dropHighlight && 'ring-2 ring-athletic',
              )}
            >
              {player.showYellowCard ? (
                <span
                  className="absolute -right-0.5 -top-0.5 size-3 rounded-[2px] border border-black/20 bg-amber-400 shadow"
                  title="Yellow card"
                  aria-label="Yellow card"
                />
              ) : null}
              {player.didNotStartFirstHalf ? (
                <span
                  className="absolute -right-1 bottom-0 z-10 rounded border border-amber-700/40 bg-amber-400 px-0.5 py-px text-[8px] font-black uppercase leading-none tracking-wide text-slate-900 shadow"
                  title="Didn't start 1st half"
                  aria-label="Didn't start 1st half"
                >
                  NS
                </span>
              ) : null}
              {allowSlotReposition ? (
                <span className="absolute -left-1 -top-1 flex size-5 items-center justify-center rounded-full border border-white/50 bg-black/60 text-white">
                  <GripVertical className="size-3" strokeWidth={2.5} aria-hidden />
                </span>
              ) : null}
              <span className="text-[10px] font-semibold leading-none tabular-nums opacity-70">
                {formatJersey(player.number)}
              </span>
              <span className="max-w-[62px] truncate text-xs font-bold leading-tight">
                {player.shortName ?? player.name}
              </span>
              {player.minutesLabel ? (
                <span
                  className={cn(
                    'mt-0.5 font-display text-base font-black tabular-nums leading-none',
                    player.needsSubCue ? 'text-amber-950' : 'text-slate-900',
                  )}
                  title={player.needsSubCue ? 'Long stint — consider a sub' : undefined}
                >
                  {player.minutesLabel}
                </span>
              ) : null}
            </div>
          ) : (
            <div
              className={cn(
                'relative flex size-12 flex-col items-center justify-center rounded-full border-2 border-dashed bg-black/20 text-white/90 backdrop-blur-sm',
                highlighted || dropHighlight ? 'border-white bg-white/20' : 'border-white/60',
              )}
            >
              {allowSlotReposition ? (
                <span className="absolute -left-1 -top-1 flex size-5 items-center justify-center rounded-full border border-white/50 bg-black/60 text-white">
                  <GripVertical className="size-3" strokeWidth={2.5} aria-hidden />
                </span>
              ) : null}
              <span className="text-[10px] font-black uppercase">{label}</span>
            </div>
          )}
        </button>

        {occupiedExtra ? (
          <div
            className={cn(chromePositionClass, 'z-10')}
            onClick={(e) => e.stopPropagation()}
          >
            {occupiedExtra}
          </div>
        ) : null}

        {allowLabelEdit ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpenLabelEditor()
            }}
            className={cn(
              chromePositionClass,
              'z-20 flex min-h-11 min-w-[4.5rem] touch-manipulation items-center justify-center gap-1.5 rounded-xl border-2 border-white/50 bg-black/80 px-3 py-2 text-xs font-black uppercase tracking-wide text-white shadow-lg active:scale-95',
            )}
            aria-label={`Change position label (${label})`}
          >
            <Pencil className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
            <span>{label}</span>
          </button>
        ) : player && !occupiedExtra ? (
          <span
            className={cn(
              chromePositionClass,
              'rounded bg-black/60 px-1.5 py-0.5 text-[8px] font-black uppercase text-white',
            )}
          >
            {label}
          </span>
        ) : null}
      </div>
    </div>
  )
}

/** Droppable player target + free XY reposition of the slot (setup only). */
function InteractiveSlot(
  props: Omit<
    Parameters<typeof PitchSlotVisual>[0],
    | 'dropHighlight'
    | 'setDroppableRef'
    | 'setRepositionRef'
    | 'repositionListeners'
    | 'repositionAttributes'
    | 'slotDragStyle'
    | 'isSlotDragging'
  >,
) {
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `slot:${props.slot.id}`,
    data: { type: 'slot' as DragType, slotId: props.slot.id },
  })

  const {
    attributes,
    listeners,
    setNodeRef: setRepositionRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `slot-move:${props.slot.id}`,
    data: { type: 'slot' as DragType, slotId: props.slot.id },
    disabled: !props.allowSlotReposition,
  })

  const slotDragStyle: CSSProperties | undefined = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined

  return (
    <PitchSlotVisual
      {...props}
      setDroppableRef={setDroppableRef}
      dropHighlight={isOver}
      setRepositionRef={props.allowSlotReposition ? setRepositionRef : undefined}
      repositionListeners={props.allowSlotReposition ? listeners : undefined}
      repositionAttributes={props.allowSlotReposition ? attributes : undefined}
      slotDragStyle={slotDragStyle}
      isSlotDragging={isDragging}
    />
  )
}

/** Drag handle for bench players — must render inside FormationPitch with enableDragDrop. */
export function FormationDraggableHandle({
  playerId,
  label = 'Drag',
  className,
}: {
  playerId: string
  label?: string
  className?: string
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `player:${playerId}`,
    data: { type: 'player' as DragType, playerId },
  })

  const style: CSSProperties | undefined = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.45 : 1 }
    : undefined

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      className={cn(
        'min-h-11 shrink-0 touch-manipulation rounded-lg border border-border bg-secondary px-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground',
        isDragging && 'z-50',
        className,
      )}
      aria-label={`Drag player`}
      {...listeners}
      {...attributes}
    >
      {label}
    </button>
  )
}

export function FormationPitch({
  formation,
  slotAssignments,
  players,
  slotLabelOverrides,
  selectedPlayerId,
  selectedSlotId,
  onAssignPlayer,
  onSlotTap,
  onSlotLabelChange,
  renderOccupiedExtra,
  enableDragDrop = true,
  children,
  className,
}: FormationPitchProps) {
  const [pitchSlots, setPitchSlots] = useState<FormationSlot[]>(() =>
    cloneFormationSlots(formation.slots),
  )
  const [activeDragPlayerId, setActiveDragPlayerId] = useState<string | null>(null)
  const [labelEditorSlotId, setLabelEditorSlotId] = useState<string | null>(null)
  const pitchSurfaceRef = useRef<HTMLDivElement>(null)

  const slotSignature = formation.slots.map((slot) => slot.id).join(',')

  // Reset coordinates when the formation template or slot set changes
  // (e.g. 9v9 3-3-2 remapped onto 7v7 2-3-1).
  useEffect(() => {
    setPitchSlots(cloneFormationSlots(formation.slots))
    setLabelEditorSlotId(null)
  }, [formation.id, slotSignature]) // eslint-disable-line react-hooks/exhaustive-deps -- template identity only

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const activeDragPlayer = activeDragPlayerId ? playerById.get(activeDragPlayerId) ?? null : null

  const sensors = useSensors(
    // Distance keeps short taps for assign/remove; longer press-drag moves the slot/player.
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 10 } }),
  )

  const handleDragStart = (event: DragStartEvent) => {
    const type = event.active.data.current?.type as DragType | undefined
    if (type === 'player') {
      const playerId =
        (event.active.data.current?.playerId as string | undefined) ??
        String(event.active.id).replace(/^player:/, '')
      setActiveDragPlayerId(playerId)
      return
    }
    setActiveDragPlayerId(null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragPlayerId(null)
    const type = event.active.data.current?.type as DragType | undefined

    if (type === 'slot') {
      const slotId =
        (event.active.data.current?.slotId as string | undefined) ??
        String(event.active.id).replace(/^slot-move:/, '')
      const { delta } = event
      const rect = pitchSurfaceRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0 || rect.height <= 0) return

      const dxPct = (delta.x / rect.width) * 100
      const dyPct = (delta.y / rect.height) * 100

      setPitchSlots((prev) =>
        prev.map((slot) =>
          slot.id === slotId
            ? {
                ...slot,
                x: clampPercent(slot.x + dxPct),
                y: clampPercent(slot.y + dyPct, 8, 86),
              }
            : slot,
        ),
      )
      return
    }

    if (type !== 'player') return

    const { active, over } = event
    if (!over) return

    const playerId =
      (active.data.current?.playerId as string | undefined) ??
      (String(active.id).startsWith('player:') ? String(active.id).slice('player:'.length) : null)
    const overType = over.data.current?.type as DragType | undefined
    const slotId =
      overType === 'slot'
        ? ((over.data.current?.slotId as string | undefined) ??
          (String(over.id).startsWith('slot:') ? String(over.id).slice('slot:'.length) : null))
        : String(over.id).startsWith('slot:')
          ? String(over.id).slice('slot:'.length)
          : null

    if (playerId && slotId) onAssignPlayer(playerId, slotId)
  }

  const pitch = (
    <div ref={pitchSurfaceRef}>
      <SoccerPitchSurface>
        {pitchSlots.map((slot) => {
          const playerId = slotAssignments[slot.id] ?? null
          const player = playerId ? playerById.get(playerId) ?? null : null
          const label = resolveSlotLabel(slot, slotLabelOverrides)
          const slotProps = {
            slot,
            label,
            player,
            selected: playerId === selectedPlayerId,
            highlighted: playerId === selectedPlayerId || selectedSlotId === slot.id,
            allowLabelEdit: Boolean(onSlotLabelChange),
            allowSlotReposition: enableDragDrop,
            labelEditorOpen: labelEditorSlotId === slot.id,
            occupiedExtra:
              playerId && renderOccupiedExtra ? renderOccupiedExtra(playerId) : undefined,
            onOpenLabelEditor: () => setLabelEditorSlotId(slot.id),
            onCloseLabelEditor: () => setLabelEditorSlotId(null),
            onLabelChange: onSlotLabelChange
              ? (next: string) => onSlotLabelChange(slot.id, next)
              : undefined,
            onTap: () => {
              setLabelEditorSlotId(null)
              onSlotTap?.(slot.id)
            },
          }
          return enableDragDrop ? (
            <InteractiveSlot key={slot.id} {...slotProps} />
          ) : (
            <PitchSlotVisual key={slot.id} {...slotProps} />
          )
        })}
      </SoccerPitchSurface>
    </div>
  )

  const content = (
    <div className={cn(className)}>
      <div className="min-w-0 shrink-0">{pitch}</div>
      {children}
    </div>
  )

  const editingSlot = labelEditorSlotId
    ? pitchSlots.find((slot) => slot.id === labelEditorSlotId)
    : null
  const labelSheet =
    editingSlot && onSlotLabelChange ? (
      <SlotLabelSheet
        slotId={editingSlot.id}
        currentLabel={resolveSlotLabel(editingSlot, slotLabelOverrides)}
        onSelect={(next) => onSlotLabelChange(editingSlot.id, next)}
        onClose={() => setLabelEditorSlotId(null)}
      />
    ) : null

  // Live / action mode: no DnD context, fixed slots, no reposition handles.
  if (!enableDragDrop) {
    return (
      <>
        {content}
        {labelSheet}
      </>
    )
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {content}
      <DragOverlay>
        {activeDragPlayer ? (
          <div className="flex items-center gap-2 rounded-xl border-2 border-neon bg-card px-3 py-2 shadow-xl">
            <span className="flex size-9 items-center justify-center rounded-full border-2 border-neon bg-neon/10 font-display text-sm font-bold text-neon">
              {formatJersey(activeDragPlayer.number)}
            </span>
            <span className="font-bold text-foreground">
              {activeDragPlayer.shortName ?? activeDragPlayer.name}
            </span>
          </div>
        ) : null}
      </DragOverlay>
      {labelSheet}
    </DndContext>
  )
}
