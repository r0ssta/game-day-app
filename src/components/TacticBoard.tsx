import { useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { Arrow, Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva'
import { formatSupabaseError, saveTacticBoard } from '@/lib/supabase-api'
import {
  curvedArrowPoints,
  defaultTacticFormationId,
  nextTacticRole,
  playersForTacticSide,
  tacticFormationsForFormat,
  type TacticBoardPhase,
  type TacticMark,
} from '@/lib/tactic-board'
import { TEAM_FORMATS, type TeamFormat } from '@/lib/team-format'
import { cn } from '@/lib/utils'

type BoardTool = 'move' | 'draw' | 'arrow' | 'curve'

type TacticPlayer = {
  id: string
  kind: 'player'
  side: 'us' | 'them'
  role: TacticMark
  x: number
  y: number
}

type TacticBall = {
  id: string
  kind: 'ball'
  x: number
  y: number
}

type TacticObject = TacticPlayer | TacticBall

type TacticStroke = {
  id: string
  kind: 'line' | 'arrow' | 'curve'
  color: string
  points: number[]
}

const DRAW_COLORS = [
  { id: 'yellow', value: '#facc15', label: 'Yellow' },
  { id: 'white', value: '#ffffff', label: 'White' },
  { id: 'blue', value: '#38bdf8', label: 'Blue' },
  { id: 'orange', value: '#fb923c', label: 'Orange' },
] as const

const PLAYER_RADIUS = 20
const BALL_RADIUS = 18
const PITCH_PAD = 14
const US_FILL = '#e4b54a'
const THEM_FILL = '#b91c1c'

const PHASE_LABEL: Record<TacticBoardPhase, string> = {
  pregame: 'Pre-game',
  live: 'During the game',
  halftime: 'Half-time',
}

type TacticBoardProps = {
  teamId: string | null
  matchId: string | null
  phase: TacticBoardPhase
  format?: TeamFormat
  className?: string
}

function tokenRadius(kind: TacticObject['kind']) {
  if (kind === 'ball') return BALL_RADIUS
  return PLAYER_RADIUS
}

export function TacticBoard({
  teamId,
  matchId,
  phase,
  format: initialFormat = '9v9',
  className,
}: TacticBoardProps) {
  const stageRef = useRef<Konva.Stage>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const drawingRef = useRef(false)
  const finishStrokeRef = useRef<() => void>(() => {})
  const lastCycleRef = useRef({ id: '', at: 0 })
  const placedShapes = useRef<{ our: string; their: string } | null>(null)
  const [format, setFormat] = useState<TeamFormat>(initialFormat)
  const [ourFormation, setOurFormation] = useState(() => defaultTacticFormationId(initialFormat))
  const [theirFormation, setTheirFormation] = useState(() => defaultTacticFormationId(initialFormat))
  const [tool, setTool] = useState<BoardTool>('move')
  const [ink, setInk] = useState<string>(DRAW_COLORS[0].value)
  const [objects, setObjects] = useState<TacticObject[]>([])
  const [strokes, setStrokes] = useState<TacticStroke[]>([])
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const update = () => {
      const rect = element.getBoundingClientRect()
      setSize({
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (tool !== 'draw' && tool !== 'arrow' && tool !== 'curve') drawingRef.current = false
  }, [tool])

  useEffect(() => {
    const end = () => finishStrokeRef.current()
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('touchend', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('touchend', end)
    }
  }, [])

  useEffect(() => {
    if (size.width < 2 || size.height < 2) return
    const previous = placedShapes.current
    if (previous?.our === ourFormation && previous?.their === theirFormation) return
    const field = {
      x: PITCH_PAD,
      y: PITCH_PAD,
      width: Math.max(0, size.width - PITCH_PAD * 2),
      height: Math.max(0, size.height - PITCH_PAD * 2),
    }
    const replaceUs = !previous || previous.our !== ourFormation
    const replaceThem = !previous || previous.their !== theirFormation
    const us = replaceUs
      ? playersForTacticSide({ formationId: ourFormation, format, side: 'us', field }).map(
          (player) => ({ ...player, id: crypto.randomUUID(), kind: 'player' as const }),
        )
      : null
    const them = replaceThem
      ? playersForTacticSide({ formationId: theirFormation, format, side: 'them', field }).map(
          (player) => ({ ...player, id: crypto.randomUUID(), kind: 'player' as const }),
        )
      : null
    setObjects((current) => {
      const balls = current.filter((item) => item.kind === 'ball')
      return [
        ...(us ?? current.filter((item) => item.kind === 'player' && item.side === 'us')),
        ...(them ?? current.filter((item) => item.kind === 'player' && item.side === 'them')),
        ...(balls.length > 0
          ? balls
          : [
              {
                id: crypto.randomUUID(),
                kind: 'ball' as const,
                x: field.x + field.width / 2,
                y: field.y + field.height / 2,
              },
            ]),
      ]
    })
    placedShapes.current = { our: ourFormation, their: theirFormation }
  }, [format, ourFormation, theirFormation, size.width, size.height])

  function handleFormatChange(next: TeamFormat) {
    const nextFormation = defaultTacticFormationId(next)
    setFormat(next)
    setOurFormation(nextFormation)
    setTheirFormation(nextFormation)
  }

  function cyclePlayer(id: string) {
    const now = Date.now()
    if (lastCycleRef.current.id === id && now - lastCycleRef.current.at < 280) return
    lastCycleRef.current = { id, at: now }
    setObjects((current) =>
      current.map((item) =>
        item.kind === 'player' && item.role !== 'GK' && item.id === id
          ? { ...item, role: nextTacticRole(item.role) }
          : item,
      ),
    )
  }

  function pointerPosition(event: Konva.KonvaEventObject<Event>) {
    return event.target.getStage()?.getPointerPosition() ?? null
  }

  function startStroke(event: Konva.KonvaEventObject<Event>) {
    if (tool !== 'draw' && tool !== 'arrow' && tool !== 'curve') return
    if (drawingRef.current) return
    const pos = pointerPosition(event)
    if (!pos) return
    if (event.evt.cancelable) event.evt.preventDefault()
    drawingRef.current = true
    setStrokes((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        kind: tool === 'draw' ? 'line' : tool,
        color: ink,
        points: tool === 'arrow' ? [pos.x, pos.y, pos.x, pos.y] : [pos.x, pos.y],
      },
    ])
  }

  function moveStroke(event: Konva.KonvaEventObject<Event>) {
    if (!drawingRef.current || (tool !== 'draw' && tool !== 'arrow' && tool !== 'curve')) return
    const pos = pointerPosition(event)
    if (!pos) return
    if (event.evt.cancelable) event.evt.preventDefault()
    setStrokes((current) => {
      const last = current[current.length - 1]
      if (!last) return current
      const next = current.slice()
      next[next.length - 1] =
        last.kind === 'arrow'
          ? { ...last, points: [last.points[0] ?? pos.x, last.points[1] ?? pos.y, pos.x, pos.y] }
          : { ...last, points: [...last.points, pos.x, pos.y] }
      return next
    })
  }

  function finishStroke() {
    if (!drawingRef.current) return
    drawingRef.current = false
    setStrokes((current) => {
      const last = current[current.length - 1]
      if (!last) return current
      if (last.kind === 'arrow' || last.kind === 'curve') {
        const x1 = last.points[0] ?? 0
        const y1 = last.points[1] ?? 0
        const x2 = last.points.at(-2) ?? x1
        const y2 = last.points.at(-1) ?? y1
        if (Math.hypot(x2 - x1, y2 - y1) < 10) return current.slice(0, -1)
      } else if (last.points.length < 4) {
        return current.slice(0, -1)
      }
      return current
    })
  }

  finishStrokeRef.current = finishStroke

  function undoStroke() {
    drawingRef.current = false
    setStrokes((current) => current.slice(0, -1))
  }

  function eraseStrokes() {
    drawingRef.current = false
    setStrokes([])
  }

  async function handleSave() {
    const stage = stageRef.current
    if (!stage) return
    const canvasJson = stage.toJSON()
    if (!teamId) {
      setStatus('Choose a team before saving this board.')
      return
    }
    setSaving(true)
    setStatus(null)
    try {
      await saveTacticBoard({ teamId, matchId, phase, canvasJson })
      setStatus('Saved')
    } catch (error) {
      setStatus(formatSupabaseError(error))
    } finally {
      setSaving(false)
    }
  }

  const marking = tool === 'draw' || tool === 'arrow' || tool === 'curve'
  const pad = PITCH_PAD
  const field = {
    x: pad,
    y: pad,
    width: Math.max(0, size.width - pad * 2),
    height: Math.max(0, size.height - pad * 2),
  }
  const midY = field.y + field.height / 2
  const centerX = field.x + field.width / 2
  const boxWidth = field.width * 0.62
  const boxHeight = field.height * 0.16
  const sixWidth = field.width * 0.34
  const sixHeight = field.height * 0.07

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="border-b border-border bg-card px-3 py-2">
        <div className="mb-2 grid grid-cols-2 gap-2">
          <FormationSelect
            label="Format"
            value={format}
            onChange={(value) => handleFormatChange(value as TeamFormat)}
            options={TEAM_FORMATS.map((option) => ({ id: option, label: option }))}
            className="col-span-2"
          />
          <FormationSelect
            label="Our formation"
            value={ourFormation}
            onChange={setOurFormation}
            options={tacticFormationsForFormat(format)}
          />
          <FormationSelect
            label="Opponent formation"
            value={theirFormation}
            onChange={setTheirFormation}
            options={tacticFormationsForFormat(format)}
          />
        </div>
        <div className="grid grid-cols-5 gap-2">
          <ToolButton
            label="Draw"
            pressed={tool === 'draw'}
            onClick={() => setTool((current) => (current === 'draw' ? 'move' : 'draw'))}
          />
          <ToolButton
            label="Arrow"
            pressed={tool === 'arrow'}
            onClick={() => setTool((current) => (current === 'arrow' ? 'move' : 'arrow'))}
          />
          <ToolButton
            label="Curve"
            pressed={tool === 'curve'}
            onClick={() => setTool((current) => (current === 'curve' ? 'move' : 'curve'))}
          />
          <ToolButton label="Undo" disabled={strokes.length === 0} onClick={undoStroke} />
          <ToolButton label="Erase" disabled={strokes.length === 0} onClick={eraseStrokes} />
        </div>
        {marking ? (
          <div
            className="mt-2 flex items-center justify-center gap-2"
            role="radiogroup"
            aria-label="Ink color"
          >
            {DRAW_COLORS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={ink === option.value}
                aria-label={option.label}
                onClick={() => setInk(option.value)}
                className={cn(
                  'size-8 touch-manipulation rounded-full border-2',
                  ink === option.value
                    ? 'border-foreground ring-2 ring-neon ring-offset-2 ring-offset-card'
                    : 'border-white/40',
                )}
                style={{ backgroundColor: option.value }}
              />
            ))}
          </div>
        ) : null}
        <p className="mt-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {tool === 'draw'
            ? 'Drag to draw'
            : tool === 'arrow'
              ? 'Drag to add an arrow'
              : tool === 'curve'
                ? 'Drag the way you want it to bend'
                : 'Tap a player to switch D, MF, F'}
        </p>
      </div>

      <div
        ref={containerRef}
        className="min-h-0 flex-1 touch-none bg-emerald-950"
      >
        {size.width > 1 && size.height > 1 ? (
          <Stage
            ref={stageRef}
            width={size.width}
            height={size.height}
            onPointerDown={startStroke}
            onPointerMove={moveStroke}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            onTouchStart={startStroke}
            onTouchMove={moveStroke}
            onTouchEnd={finishStroke}
            onTouchCancel={finishStroke}
            onMouseDown={startStroke}
            onMouseMove={moveStroke}
            onMouseUp={finishStroke}
            style={{ cursor: marking ? 'crosshair' : 'default' }}
          >
            <Layer>
              <Rect
                x={0}
                y={0}
                width={size.width}
                height={size.height}
                fill="#166534"
              />
              <Rect
                x={field.x}
                y={field.y}
                width={field.width}
                height={field.height}
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={2}
                listening={false}
              />
              <Line
                points={[field.x, midY, field.x + field.width, midY]}
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={2}
                listening={false}
              />
              <Circle
                x={centerX}
                y={midY}
                radius={Math.min(field.width, field.height) * 0.12}
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={2}
                listening={false}
              />
              <Circle
                x={centerX}
                y={midY}
                radius={3}
                fill="rgba(255,255,255,0.9)"
                listening={false}
              />
              <Rect
                x={centerX - boxWidth / 2}
                y={field.y}
                width={boxWidth}
                height={boxHeight}
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={2}
                listening={false}
              />
              <Rect
                x={centerX - sixWidth / 2}
                y={field.y}
                width={sixWidth}
                height={sixHeight}
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={2}
                listening={false}
              />
              <Rect
                x={centerX - boxWidth / 2}
                y={field.y + field.height - boxHeight}
                width={boxWidth}
                height={boxHeight}
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={2}
                listening={false}
              />
              <Rect
                x={centerX - sixWidth / 2}
                y={field.y + field.height - sixHeight}
                width={sixWidth}
                height={sixHeight}
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={2}
                listening={false}
              />

              {strokes.map((stroke) =>
                stroke.kind === 'line' ? (
                  <Line
                    key={stroke.id}
                    points={stroke.points}
                    stroke={stroke.color}
                    strokeWidth={4}
                    tension={0.4}
                    lineCap="round"
                    lineJoin="round"
                    listening={false}
                  />
                ) : (
                  <Arrow
                    key={stroke.id}
                    points={
                      stroke.kind === 'curve' ? curvedArrowPoints(stroke.points) : stroke.points
                    }
                    stroke={stroke.color}
                    fill={stroke.color}
                    strokeWidth={4}
                    pointerLength={16}
                    pointerWidth={16}
                    lineCap="round"
                    lineJoin="round"
                    listening={false}
                  />
                ),
              )}

              {objects.map((object) => {
                const radius = tokenRadius(object.kind)
                return (
                  <Group
                    key={object.id}
                    x={object.x}
                    y={object.y}
                    draggable={!marking}
                    listening={!marking}
                    dragBoundFunc={(pos) => ({
                      x: Math.max(radius, Math.min(size.width - radius, pos.x)),
                      y: Math.max(radius, Math.min(size.height - radius, pos.y)),
                    })}
                    onDragEnd={(event) => {
                      const next = event.target.position()
                      setObjects((current) =>
                        current.map((item) =>
                          item.id === object.id ? { ...item, x: next.x, y: next.y } : item,
                        ),
                      )
                    }}
                    onClick={() => {
                      if (object.kind === 'player' && object.role !== 'GK') cyclePlayer(object.id)
                    }}
                    onTap={() => {
                      if (object.kind === 'player' && object.role !== 'GK') cyclePlayer(object.id)
                    }}
                  >
                    <Circle
                      radius={radius}
                      fill={
                        object.kind === 'ball'
                          ? '#f8fafc'
                          : object.side === 'us'
                            ? US_FILL
                            : THEM_FILL
                      }
                      stroke={object.kind === 'ball' ? '#0f172a' : '#ffffff'}
                      strokeWidth={object.kind === 'ball' ? 1.5 : 2}
                    />
                    {object.kind === 'player' ? (
                      <Text
                        x={-radius}
                        y={object.role === 'D' || object.role === 'F' ? -7 : -6}
                        width={radius * 2}
                        text={object.role}
                        align="center"
                        fontStyle="bold"
                        fontSize={object.role === 'D' || object.role === 'F' ? 14 : 11}
                        fill={object.side === 'us' ? '#1c1408' : '#ffffff'}
                        listening={false}
                      />
                    ) : null}
                  </Group>
                )
              })}
            </Layer>
          </Stage>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-border bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {status ? (
          <p className="text-center text-sm font-semibold text-foreground" role="status">
            {status}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || size.width < 2}
          className="min-h-12 w-full touch-manipulation rounded-xl bg-neon py-3 text-sm font-bold uppercase tracking-wide text-neon-foreground active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function FormationSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { id: string; label: string }[]
  className?: string
}) {
  const selectId = label.toLowerCase().replace(/\s+/g, '-')
  return (
    <label htmlFor={selectId} className={cn('block min-w-0', className)}>
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <select
        id={selectId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border-2 border-border bg-background px-2 py-2 text-sm font-bold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ToolButton({
  label,
  onClick,
  pressed,
  disabled = false,
}: {
  label: string
  onClick: () => void
  pressed?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      disabled={disabled}
      className={cn(
        'inline-flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-xl border-2 px-2 py-2 text-xs font-bold uppercase tracking-wide active:scale-[0.98] disabled:opacity-40',
        pressed
          ? 'border-neon bg-neon/15 text-foreground'
          : 'border-border bg-background text-foreground',
      )}
    >
      {label}
    </button>
  )
}

export function TacticBoardEntry({
  teamId,
  matchId,
  phase,
  format = '9v9',
}: {
  teamId: string | null
  matchId: string | null
  phase: TacticBoardPhase
  format?: TeamFormat
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full touch-manipulation items-center justify-center rounded-xl border-2 border-border bg-card px-4 py-3 text-sm font-bold uppercase tracking-wide text-foreground active:scale-[0.98]"
      >
        Tactic Board
      </button>
      {open ? (
        <TacticBoardSheet
          teamId={teamId}
          matchId={matchId}
          phase={phase}
          format={format}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}

export function TacticBoardSheet({
  teamId,
  matchId,
  phase,
  format,
  onClose,
}: {
  teamId: string | null
  matchId: string | null
  phase: TacticBoardPhase
  format: TeamFormat
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[125] flex flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-foreground">
            Tactic Board
          </h2>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {PHASE_LABEL[phase]}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 shrink-0 touch-manipulation rounded-lg bg-secondary px-4 text-xs font-bold uppercase tracking-wide text-foreground"
        >
          Close
        </button>
      </header>
      <TacticBoard
        teamId={teamId}
        matchId={matchId}
        phase={phase}
        format={format}
        className="min-h-0 flex-1"
      />
    </div>
  )
}
