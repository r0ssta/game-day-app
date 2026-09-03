import { describe, expect, it } from 'vitest'
import { startingLineupNote } from './match-event-notes'
import { aggregatePlayerRecaps } from './match-recap'
import type { DbMatchEvent } from '@/types/database'

const BESS = '22222222-2222-4000-8000-000000000002'

function event(
  partial: Partial<DbMatchEvent> & Pick<DbMatchEvent, 'id' | 'event_type'>,
): DbMatchEvent {
  return {
    match_id: 'm1',
    player_id: BESS,
    timestamp: 0,
    event_notes: null,
    formation: null,
    assist_player_id: null,
    pk_result: null,
    pk_team: null,
    created_at: '2026-09-02T18:00:00.000Z',
    ...partial,
  }
}

describe('aggregatePlayerRecaps saves', () => {
  it('credits the on-pitch GK for an unpaired opponent shot', () => {
    const stats = aggregatePlayerRecaps(
      [
        event({
          id: 'lu',
          event_type: 'sub_in',
          event_notes: startingLineupNote('GK'),
        }),
        event({
          id: 'shot',
          event_type: 'shot_away',
          player_id: null,
          timestamp: 80,
          created_at: '2026-09-02T18:02:00.000Z',
        }),
      ],
      1800,
    )

    expect(stats.get(BESS)?.saves).toBe(1)
  })
})
