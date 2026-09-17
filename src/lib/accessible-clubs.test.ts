import { describe, expect, it } from 'vitest'
import {
  mergeAccessibleClubs,
  resolveAccessibleClubId,
  resolveClubAppRole,
} from './accessible-clubs'

const velocity = { id: 'vv', name: 'Virginia Velocity', slug: 'virginia-velocity' }
const demo = { id: 'demo', name: 'Demo FC', slug: 'demo-fc' }

describe('accessible clubs', () => {
  it('unions memberships with every club an admin can see', () => {
    expect(
      mergeAccessibleClubs(
        [{ clubId: 'vv', clubName: 'Virginia Velocity', clubSlug: 'virginia-velocity' }],
        [demo, velocity],
      ),
    ).toEqual([demo, velocity])
  })

  it('keeps a membership that is missing from the admin list', () => {
    expect(
      mergeAccessibleClubs(
        [{ clubId: 'vv', clubName: 'Virginia Velocity', clubSlug: 'virginia-velocity' }],
        [demo],
      ),
    ).toEqual([demo, velocity])
  })

  it('prefers an explicit club, then persisted, then Virginia Velocity', () => {
    const clubs = [demo, velocity]
    expect(resolveAccessibleClubId(clubs, { preferredClubId: 'demo' })).toBe('demo')
    expect(resolveAccessibleClubId(clubs, { persistedClubId: 'demo' })).toBe('demo')
    expect(resolveAccessibleClubId(clubs)).toBe('vv')
    expect(resolveAccessibleClubId([])).toBeNull()
  })

  it('treats platform/system admins as directors of clubs they are not members of', () => {
    expect(
      resolveClubAppRole([{ clubId: 'vv', appRole: 'director' }], 'demo', true),
    ).toBe('director')
    expect(
      resolveClubAppRole([{ clubId: 'vv', appRole: 'director' }], 'vv', true),
    ).toBe('director')
    expect(
      resolveClubAppRole([{ clubId: 'vv', appRole: 'coach' }], 'vv', true),
    ).toBe('coach')
    expect(resolveClubAppRole([], 'demo', false)).toBe('pending')
  })
})
