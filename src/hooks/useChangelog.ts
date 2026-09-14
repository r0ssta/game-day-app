import { useCallback, useMemo, useState } from 'react'
import {
  CHANGELOG,
  hasUnreadChangelog,
  latestChangelogVersion,
  readLastSeenVersion,
  writeLastSeenVersion,
  type ChangelogRelease,
} from '@/data/changelog'

export function useChangelog(): {
  releases: ChangelogRelease[]
  hasUnreadUpdates: boolean
  markAsRead: () => void
} {
  const [lastSeenVersion, setLastSeenVersion] = useState<string | null>(readLastSeenVersion)
  const newestVersion = latestChangelogVersion(CHANGELOG)
  const hasUnreadUpdates = useMemo(
    () => hasUnreadChangelog(lastSeenVersion, CHANGELOG),
    [lastSeenVersion],
  )

  const markAsRead = useCallback(() => {
    if (!newestVersion) return
    writeLastSeenVersion(newestVersion)
    setLastSeenVersion(newestVersion)
  }, [newestVersion])

  return {
    releases: CHANGELOG,
    hasUnreadUpdates,
    markAsRead,
  }
}
