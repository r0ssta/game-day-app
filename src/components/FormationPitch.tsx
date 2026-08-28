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
import { GripVertical } from 'lucide-react'
import { SoccerPitchSurface } from '@/components/SoccerPitchSurface'
import {
  TACTICAL_SLOT_LABELS,
  resolveSlotLabel,
  type Formation,
  type FormationSlot,
} from '@/lib/formations'
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
  /** Pulse slots to show they are tappable (live). */
  pulseInteractive?: boolean
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

function SlotLabelPopover({
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
    <div
      className="absolute left-1/2 top-full z-40 mt-1 w-44 -translate-x-1/2 rounded-xl border-2 border-border bg-popover p-2 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={`Change position for ${slotId}`}
    >
      <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Position label
      </p>
      <div className="grid max-h-48 grid-cols-3 gap-1 overflow-y-auto">
        {TACTICAL_SLOT_LABELS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              onSelect(label)
              onClose()
            }}
            className={cn(
              'min-h-9 touch-manipulation rounded-lg border px-1 text-[11px] font-black uppercase',
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
  )
}

function PitchSlotVisual({
  slot,
  label,
  player,
  selected,
  highlighted,
  pulseInteractive,
  allowLabelEdit,
  allowSlotReposition,
  labelEditorOpen,
  dropHighlight,
  setDroppableRef,
  dragHandleRef,
  dragHandleListeners,
  dragHandleAttributes,
  slotDragStyle,
  isSlotDragging,
  occupiedExtra,
  onOpenLabelEditor,
  onCloseLabelEditor,
  onLabelChange,
  onTap,
}: {
  slot: FormationSlot
  label: string
  player: FormationPitchPlayer | null
  selected: boolean
  highlighted: boolean
  pulseInteractive?: boolean
  allowLabelEdit: boolean
  allowSlotReposition: boolean
  labelEditorOpen: boolean
  dropHighlight?: boolean
  setDroppableRef?: (node: HTMLElement | null) => void
  dragHandleRef?: (node: HTMLElement | null) => void
  dragHandleListeners?: ReturnType<typeof useDraggable>['listeners']
  dragHandleAttributes?: ReturnType<typeof useDraggable>['attributes']
  slotDragStyle?: CSSProperties
  isSlotDragging?: boolean
  occupiedExtra?: ReactNode
  onOpenLabelEditor: () => void
  onCloseLabelEditor: () => void
  onLabelChange?: (label: string) => void
  onTap: () => void
}) {
  return (
    <div
      ref={setDroppableRef}
      className={cn('absolute', isSlotDragging && 'z-30')}
      style={{
        left: `${slot.x}%`,
        top: `${slot.y}%`,
        ...slotDragStyle,
      }}
    >
      <div className="relative -translate-x-1/2 -translate-y-1/2">
        <button
          type="button"
          onClick={onTap}
          className={cn(
            'flex min-h-11 min-w-11 touch-pan-y flex-col items-center transition-transform active:scale-95',
            highlighted && 'z-10 scale-110',
            dropHighlight && 'scale-110',
            pulseInteractive && 'animate-pulse',
          )}
        >
          {player ? (
            <div
              className={cn(
                'relative flex size-14 flex-col items-center justify-center rounded-full border-2 bg-neon text-neon-foreground shadow-lg',
                selected ? 'border-white ring-2 ring-white/80' : 'border-neon-foreground/30',
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
              <span className="font-display text-lg font-black leading-none tabular-nums">
                {formatJersey(player.number)}
              </span>
              <span className="max-w-[52px] truncate text-[9px] font-bold leading-tight">
                {player.shortName ?? player.name}
              </span>
              {player.minutesLabel ? (
                <span className="mt-0.5 font-mono text-[8px] font-black tabular-nums leading-none text-slate-900">
                  {player.minutesLabel}
                </span>
              ) : null}
            </div>
          ) : (
            <div
              className={cn(
                'flex size-12 flex-col items-center justify-center rounded-full border-2 border-dashed bg-black/20 text-white/90 backdrop-blur-sm',
                highlighted || dropHighlight ? 'border-white bg-white/20' : 'border-white/60',
              )}
            >
              <span className="text-[10px] font-black uppercase">{label}</span>
            </div>
          )}
        </button>

        {allowSlotReposition ? (
          <button
            ref={dragHandleRef}
            type="button"
            className={cn(
              'absolute -right-3 top-1/2 z-20 flex size-8 -translate-y-1/2 touch-none items-center justify-center rounded-md border border-white/50 bg-black/70 text-white shadow',
              isSlotDragging && 'ring-2 ring-athletic',
            )}
            aria-label={`Reposition ${label} slot`}
            {...(dragHandleListeners ?? {})}
            {...(dragHandleAttributes ?? {})}
          >
            <GripVertical className="size-4" strokeWidth={2.5} />
          </button>
        ) : null}

        {occupiedExtra ? (
          <div
            className="absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2"
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
            className="absolute -bottom-1 left-1/2 z-20 -translate-x-1/2 rounded border border-white/40 bg-black/70 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white"
            aria-label={`Change position label (${label})`}
          >
            {label}
          </button>
        ) : player && !occupiedExtra ? (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-black/60 px-1 py-0.5 text-[8px] font-black uppercase text-white">
            {label}
          </span>
        ) : null}

        {labelEditorOpen && onLabelChange ? (
          <SlotLabelPopover
            slotId={slot.id}
            currentLabel={label}
            onSelect={onLabelChange}
            onClose={onCloseLabelEditor}
          />
        ) : null}
      </div>
    </div>
  )
}

/** Droppable player target + optional slot-reposition drag handle (setup only). */
function InteractiveSlot(
  props: Omit<
    Parameters<typeof PitchSlotVisual>[0],
    | 'dropHighlight'
    | 'setDroppableRef'
    | 'dragHandleRef'
    | 'dragHandleListeners'
    | 'dragHandleAttributes'
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
    setNodeRef: setDragHandleRef,
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
      dragHandleRef={props.allowSlotReposition ? setDragHandleRef : undefined}
      dragHandleListeners={props.allowSlotReposition ? listeners : undefined}
      dragHandleAttributes={props.allowSlotReposition ? attributes : undefined}
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
  pulseInteractive = false,
  children,
  className,
}: FormationPitchProps) {
  const [pitchSlots, setPitchSlots] = useState<FormationSlot[]>(() =>
    cloneFormationSlots(formation.slots),
  )
  const [activeDragPlayerId, setActiveDragPlayerId] = useState<string | null>(null)
  const [labelEditorSlotId, setLabelEditorSlotId] = useState<string | null>(null)
  const pitchSurfaceRef = useRef<HTMLDivElement>(null)

  // Reset coordinates when the formation template changes.
  useEffect(() => {
    setPitchSlots(cloneFormationSlots(formation.slots))
    setLabelEditorSlotId(null)
  }, [formation.id]) // eslint-disable-line react-hooks/exhaustive-deps -- template identity only

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const activeDragPlayer = activeDragPlayerId ? playerById.get(activeDragPlayerId) ?? null : null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
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
                y: clampPercent(slot.y + dyPct),
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
            highlighted: Boolean(selectedPlayerId) || selectedSlotId === slot.id,
            pulseInteractive,
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

  // Live / action mode: no DnD context, fixed slots, no reposition handles.
  if (!enableDragDrop) return content

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
    </DndContext>
  )
}
