import { beforeEach, describe, expect, it } from 'vitest'
import {
  CHANGELOG,
  LAST_SEEN_VERSION_KEY,
  hasUnreadChangelog,
  latestChangelogVersion,
  previewChangelog,
  readLastSeenVersion,
  writeLastSeenVersion,
  type ChangelogRelease,
} from './changelog'

const memory = new Map<string, string>()

beforeEach(() => {
  memory.clear()
  globalThis.localStorage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value)
    },
    removeItem: (key: string) => {
      memory.delete(key)
    },
    clear: () => memory.clear(),
    key: (index: number) => [...memory.keys()][index] ?? null,
    get length() {
      return memory.size
    },
  }
})

describe('changelog', () => {
  it('lists a newest-first release with the expected shape', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0)
    const latest = CHANGELOG[0]
    expect(latest?.version).toBeTruthy()
    expect(latest?.date).toBeTruthy()
    expect(latest?.title).toBeTruthy()
    expect(latest?.features.length).toBeGreaterThan(0)
    expect(latestChangelogVersion()).toBe(latest?.version)
  })

  it('previews the newest groupings and leaves older ones for the full list', () => {
    expect(CHANGELOG.length).toBeGreaterThan(3)
    const preview = previewChangelog()
    expect(preview).toHaveLength(3)
    expect(preview[0]?.version).toBe(CHANGELOG[0]?.version)
    expect(preview[2]?.version).toBe(CHANGELOG[2]?.version)
    expect(previewChangelog(CHANGELOG, 1)).toEqual([CHANGELOG[0]])
  })

  it('treats a missing last-seen version as unread', () => {
    expect(hasUnreadChangelog(null)).toBe(true)
  })

  it('clears unread once last-seen matches the newest version', () => {
    const newest = latestChangelogVersion()
    expect(hasUnreadChangelog(newest)).toBe(false)
    expect(hasUnreadChangelog('0.0.0')).toBe(true)
  })

  it('reads and writes last_seen_version in localStorage', () => {
    expect(readLastSeenVersion()).toBeNull()
    writeLastSeenVersion('2026.09.14')
    expect(memory.get(LAST_SEEN_VERSION_KEY)).toBe('2026.09.14')
    expect(readLastSeenVersion()).toBe('2026.09.14')
  })

  it('ignores empty releases when computing unread', () => {
    const empty: ChangelogRelease[] = []
    expect(latestChangelogVersion(empty)).toBeNull()
    expect(hasUnreadChangelog(null, empty)).toBe(false)
  })
})
