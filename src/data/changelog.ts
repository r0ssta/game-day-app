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
      'Weighted Impact (WPI) splits into Offense and Defense, then combines them',
      'Lineup sync fixed when two coaches work the same live match',
      'Tournament extra time and penalty kicks added',
      'Background clock fixes so the timer stays accurate if you leave the app',
      'Switching teams no longer shows the last game’s score or lineup',
      'Halftime bench now splits field vs goalkeeper minutes',
      'Opponent goals can be tagged (unforced error, counter, set piece, great play)',
    ],
  },
  {
    version: '2026.09.07',
    date: 'September 7, 2026',
    title: 'Recaps you can trust',
    features: [
      'Recap minutes no longer inflate from leftover 0:00 kickoffs',
      'Scheduled lineups save, reopen, and replace without errors',
      'Resume and Get Ready follow the team you selected',
    ],
  },
  {
    version: '2026.09.04',
    date: 'September 4, 2026',
    title: 'Clearer sideline',
    features: [
      'Pitch and bench badges lead with name and minutes played',
      'Tag opponent goals in one tap',
      'Edit match details after the whistle, and fix scheduled games',
    ],
  },
  {
    version: '2026.09.02',
    date: 'September 2, 2026',
    title: 'Parent Hub recaps',
    features: [
      'Half-by-half recap and the actual game length',
      'Live game feed on every match, not only while it is in progress',
      'Kickoff XI written from the pitch',
      'Finished matches stay on Recaps',
    ],
  },
  {
    version: '2026.09.01',
    date: 'September 1, 2026',
    title: 'Faster live match',
    features: [
      'Goals and substitutions feel as instant as shots',
      'Match clock stays put when staff devices sync',
      'Parent Hub cached for slow fields',
      '7v7 pitches stay on seven slots',
    ],
  },
]

/** How many newest groupings the What’s New sheet shows before “See all”. */
export const CHANGELOG_PREVIEW_COUNT = 3

export function previewChangelog(
  releases: ChangelogRelease[] = CHANGELOG,
  limit = CHANGELOG_PREVIEW_COUNT,
): ChangelogRelease[] {
  return releases.slice(0, Math.max(0, limit))
}

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
