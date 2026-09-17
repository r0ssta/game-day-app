import { describe, expect, it } from 'vitest'
import {
  APP_OPENED_DEBOUNCE_MS,
  shouldRecordAppOpened,
  summarizeLastActive,
} from './audit-log'
import type { DbAuditLog } from '@/types/database'

function log(overrides: Partial<DbAuditLog>): DbAuditLog {
  return {
    id: overrides.id ?? 'id',
    user_id: overrides.user_id ?? 'user-a',
    club_id: null,
    team_id: null,
    action_type: overrides.action_type ?? 'app_opened',
    metadata: overrides.metadata ?? {},
    created_at: overrides.created_at ?? '2026-09-17T14:00:00.000Z',
  }
}

describe('shouldRecordAppOpened', () => {
  it('logs the first open and then waits out the debounce window', () => {
    const now = 1_000_000
    expect(shouldRecordAppOpened(null, now)).toBe(true)
    expect(shouldRecordAppOpened(now, now + 60_000)).toBe(false)
    expect(shouldRecordAppOpened(now, now + APP_OPENED_DEBOUNCE_MS - 1)).toBe(false)
    expect(shouldRecordAppOpened(now, now + APP_OPENED_DEBOUNCE_MS)).toBe(true)
  })
})

describe('summarizeLastActive', () => {
  it('keeps the newest action per user and backfills email from a later login row', () => {
    const rows = summarizeLastActive([
      log({
        id: '1',
        user_id: 'user-a',
        action_type: 'match_started',
        created_at: '2026-09-17T16:00:00.000Z',
      }),
      log({
        id: '2',
        user_id: 'user-b',
        action_type: 'app_opened',
        created_at: '2026-09-17T15:00:00.000Z',
        metadata: { email: 'b@club.test' },
      }),
      log({
        id: '3',
        user_id: 'user-a',
        action_type: 'login',
        created_at: '2026-09-17T08:00:00.000Z',
        metadata: { email: 'a@club.test' },
      }),
    ])

    expect(rows).toEqual([
      {
        userId: 'user-a',
        lastAt: '2026-09-17T16:00:00.000Z',
        lastAction: 'match_started',
        email: 'a@club.test',
      },
      {
        userId: 'user-b',
        lastAt: '2026-09-17T15:00:00.000Z',
        lastAction: 'app_opened',
        email: 'b@club.test',
      },
    ])
  })
})
