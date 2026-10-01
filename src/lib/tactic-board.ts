import { getDefaultFormationId, getFormationById, getFormationsForFormat } from '@/lib/formations'
import type { FormationRole } from '@/lib/formations'
import type { TeamFormat } from '@/lib/team-format'

export const TACTIC_ROLES = ['D', 'MF', 'F'] as const

export type TacticRole = (typeof TACTIC_ROLES)[number]

export type TacticMark = 'GK' | TacticRole

export type TacticFormationPlayer = {
  side: 'us' | 'them'
  role: TacticMark
  x: number
  y: number
}

const MARK_FOR_SLOT: Record<FormationRole, TacticMark> = {
  GK: 'GK',
  DEF: 'D',
  MID: 'MF',
  FWD: 'F',
}

export function tacticFormationsForFormat(format: TeamFormat): { id: string; label: string }[] {
  return getFormationsForFormat(format).map((formation) => ({
    id: formation.id,
    label: formation.label,
  }))
}

export function defaultTacticFormationId(format: TeamFormat): string {
  return getDefaultFormationId(format)
}

/** One side of a shape. Us fills the bottom half; the opponent fills the top. */
export function playersForTacticSide(input: {
  formationId: string
  format: TeamFormat
  side: 'us' | 'them'
  field: { x: number; y: number; width: number; height: number }
}): TacticFormationPlayer[] {
  const formation = getFormationById(input.formationId, input.format)
  const { x, y, width, height } = input.field
  const opponent = input.side === 'them'

  return formation.slots.map((slot) => ({
    side: input.side,
    role: MARK_FOR_SLOT[slot.role],
    x: x + ((opponent ? 100 - slot.x : slot.x) / 100) * width,
    y: y + (opponent ? 0.5 - slot.y / 200 : 0.5 + slot.y / 200) * height,
  }))
}

/** Sample a quadratic arc from a drag. The bow sits to the left of the drag. */
export function curvedArrowPoints(x1: number, y1: number, x2: number, y2: number): number[] {
  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.hypot(dx, dy)
  if (length < 1) return [x1, y1, x2, y2]

  const bend = length * 0.35
  const cx = (x1 + x2) / 2 + (-dy / length) * bend
  const cy = (y1 + y2) / 2 + (dx / length) * bend
  const steps = 24
  const points: number[] = []
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    const remain = 1 - t
    points.push(
      remain * remain * x1 + 2 * remain * t * cx + t * t * x2,
      remain * remain * y1 + 2 * remain * t * cy + t * t * y2,
    )
  }
  return points
}

export function nextTacticRole(role: TacticRole): TacticRole {
  const index = TACTIC_ROLES.indexOf(role)
  return TACTIC_ROLES[(index + 1) % TACTIC_ROLES.length] ?? 'D'
}

export const TACTIC_BOARD_PHASES = ['pregame', 'live', 'halftime'] as const

export type TacticBoardPhase = (typeof TACTIC_BOARD_PHASES)[number]

export type TacticBoardInsert = {
  team_id: string
  match_id: string | null
  phase: TacticBoardPhase
  canvas_json: Record<string, unknown>
}

/** Turn `stage.toJSON()` into the row written to `tactic_boards.canvas_json`. */
export function tacticBoardInsert(input: {
  teamId: string
  matchId: string | null
  phase: TacticBoardPhase
  canvasJson: string
}): TacticBoardInsert {
  let parsed: unknown
  try {
    parsed = JSON.parse(input.canvasJson)
  } catch {
    throw new Error('Tactic board canvas is not valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tactic board canvas is not a JSON object')
  }
  return {
    team_id: input.teamId,
    match_id: input.matchId,
    phase: input.phase,
    canvas_json: parsed as Record<string, unknown>,
  }
}
