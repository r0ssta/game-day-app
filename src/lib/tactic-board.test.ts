import { describe, expect, it } from 'vitest'
import { getDefaultFormationId } from './formations'
import {
  defaultTacticFormationId,
  nextTacticRole,
  playersForTacticSide,
  tacticBoardInsert,
  tacticFormationsForFormat,
} from './tactic-board'

const field = { x: 14, y: 14, width: 300, height: 400 }
const halfway = field.y + field.height / 2

describe('playersForTacticSide', () => {
  it('puts our shape in the bottom half and theirs in the top, each with a keeper', () => {
    expect(defaultTacticFormationId('7v7')).toBe('2-3-1')
    expect(defaultTacticFormationId('9v9')).toBe('3-3-2')
    expect(defaultTacticFormationId('11v11')).toBe('4-4-2')

    const us = playersForTacticSide({
      formationId: '3-3-2',
      format: '9v9',
      side: 'us',
      field,
    })
    const them = playersForTacticSide({
      formationId: '4-3-1',
      format: '9v9',
      side: 'them',
      field,
    })

    expect(us).toHaveLength(9)
    expect(them).toHaveLength(9)
    expect(us.every((player) => player.side === 'us' && player.y > halfway)).toBe(true)
    expect(them.every((player) => player.side === 'them' && player.y < halfway)).toBe(true)
    expect(us.some((player) => player.role === 'GK')).toBe(true)
    expect(them.some((player) => player.role === 'GK')).toBe(true)
  })

  it('lists only the shapes for the selected format', () => {
    expect(tacticFormationsForFormat('7v7').map((formation) => formation.label)).toEqual([
      '2-3-1',
      '3-2-1',
    ])
    expect(getDefaultFormationId('11v11')).toBe(tacticFormationsForFormat('11v11')[0]?.id)
  })
})

describe('nextTacticRole', () => {
  it('cycles defender, midfield, and forward', () => {
    expect(nextTacticRole('D')).toBe('MF')
    expect(nextTacticRole('MF')).toBe('F')
    expect(nextTacticRole('F')).toBe('D')
  })
})

describe('tacticBoardInsert', () => {
  it('stores the Konva stage document for a Supabase insert', () => {
    const canvasJson = JSON.stringify({
      attrs: { width: 320, height: 480 },
      className: 'Stage',
      children: [],
    })

    expect(
      tacticBoardInsert({
        teamId: 'team-1',
        matchId: null,
        phase: 'pregame',
        canvasJson,
      }),
    ).toEqual({
      team_id: 'team-1',
      match_id: null,
      phase: 'pregame',
      canvas_json: {
        attrs: { width: 320, height: 480 },
        className: 'Stage',
        children: [],
      },
    })
  })

  it('rejects canvas JSON that is not an object', () => {
    expect(() =>
      tacticBoardInsert({
        teamId: 'team-1',
        matchId: 'match-1',
        phase: 'live',
        canvasJson: '[]',
      }),
    ).toThrow(/JSON object/)
  })
})
