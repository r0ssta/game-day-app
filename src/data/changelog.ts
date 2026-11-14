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
    version: '2026.10.05',
    date: 'October 5, 2026',
    title: 'Confirm an early whistle',
    features: [
      'Ending a half with more than a minute still on the clock asks you to confirm before the update goes out',
    ],
  },
  {
    version: '2026.10.04',
    date: 'October 4, 2026',
    title: 'Own goals and Goal taps',
    features: [
      'Own Goal is a goal type — tap it and the score counts, with no scorer or shot',
      'Closing the Goal sheet still logs the goal; Undo drops a tap you did not mean',
    ],
  },
  {
    version: '2026.09.29',
    date: 'September 29, 2026',
    title: 'Change who’s in during the game',
    features: [
      'Players marked out stay at the bottom of the pitch so you can bring them onto the bench',
      'Tap a bench player to mark them out — injured, left early, or no reason',
      'Tag a shot or save as a free kick, penalty, short-range, or long-range try, and who took it',
      'Recaps and season reporting show those shot types, and which of our players took them',
      'Goals use the same shot types: free kick, penalty, short-range, or long-range',
      'If a corner was in the last 90 seconds, confirm whether the goal came directly from it',
    ],
  },
  {
    version: '2026.09.27',
    date: 'September 27, 2026',
    title: 'Scheduling and full game time',
    features: [
      'Coach recap game length includes the whole match, not only the last period',
      'Opponent names stay put while you schedule a match',
      'Shaking the iPhone no longer opens Undo Edit while you type',
    ],
  },
  {
    version: '2026.09.14',
    date: 'September 14, 2026',
    title: 'Smoother game days',
    features: [
      'Weighted Impact (WPI) splits into Offense and Defense, then combines them',
      'WPI gives scorers and assisters extra offense that shrinks in blowouts and grows in tight games, then scales by opponent strength',
      'Goalkeeper time now counts in on-pitch +/- and WPI, so a half in goal is no longer invisible',
      'Parent Hub recap no longer labels first-half starters as Came on when kickoff XI was not logged',
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
