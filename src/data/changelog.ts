/** localStorage key for the last changelog version a coach has opened. */
export const LAST_SEEN_VERSION_KEY = 'last_seen_version'

export type ChangelogRelease = {
  version: string
  date: string
  title: string
  features: string[]
}

/** Newest release first. `version` is compared to `last_seen_version`. */
export const CHANGELOG: ChangelogRelease[] = [
  {
    version: '2026.09.14',
    date: 'September 14, 2026',
    title: 'Smoother game days',
    features: [
      'Lineup sync fixed when two coaches work the same live match',
      'Tournament extra time and penalty kicks added',
      'Background clock fixes so the timer stays accurate if you leave the app',
      'Switching teams no longer shows the last game’s score or lineup',
      'Halftime bench now splits field vs goalkeeper minutes',
      'Opponent goals can be tagged (unforced error, counter, set piece, great play)',
    ],
  },
]

export function latestChangelogVersion(
  releases: ChangelogRelease[] = CHANGELOG,
): string | null {
  return releases[0]?.version ?? null
}

export function hasUnreadChangelog(
  lastSeenVersion: string | null,
  releases: ChangelogRelease[] = CHANGELOG,
): boolean {
  const newest = latestChangelogVersion(releases)
  if (!newest) return false
  return lastSeenVersion !== newest
}

export function readLastSeenVersion(): string | null {
  try {
    const value = localStorage.getItem(LAST_SEEN_VERSION_KEY)
    return value && value.trim().length > 0 ? value : null
  } catch {
    return null
  }
}

export function writeLastSeenVersion(version: string): void {
  try {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, version)
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
}
