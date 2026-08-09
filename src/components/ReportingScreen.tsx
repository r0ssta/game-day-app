import { useEffect, useState, type ReactNode } from 'react'
import { ScreenHeader } from '@/components/AppNavigation'
import { PlayerBreakdownsTab } from '@/components/reporting/PlayerBreakdownsTab'
import { PlayerSeasonProfileView } from '@/components/reporting/PlayerSeasonProfileView'
import { PreviousMatchesTab } from '@/components/reporting/PreviousMatchesTab'
import {
  ReportingTabBar,
  type ReportingTab,
} from '@/components/reporting/ReportingTabBar'
import { SeasonDetailsTab } from '@/components/reporting/SeasonDetailsTab'
import {
  emptyPlayerSeasonStats,
  emptySeasonReportData,
  getPlayerFromRoster,
  loadSeasonReport,
  type SeasonReportData,
} from '@/lib/season-reporting'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import type { DbMatch } from '@/types/database'
import type { RosterPlayer } from '@/types/match'

type ReportingScreenProps = {
  activeTeamId: string | null
  activeTeamName: string
  teamSwitcher?: ReactNode
  teamRoster: RosterPlayer[]
  pendingReviewMatches: DbMatch[]
  initialTab?: ReportingTab
  onOpenPendingReview: (matchId: string) => void
  onOpenMatchRecap: (matchId: string) => void
  onViewRecaps: () => void
  onRefreshRoster: () => Promise<void>
  onBackToHome: () => void
}

export function ReportingScreen({
  activeTeamId,
  activeTeamName,
  teamSwitcher,
  teamRoster,
  pendingReviewMatches,
  initialTab = 'matches',
  onOpenPendingReview,
  onOpenMatchRecap,
  onViewRecaps,
  onRefreshRoster,
  onBackToHome,
}: ReportingScreenProps) {
  const [activeTab, setActiveTab] = useState<ReportingTab>(initialTab)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reportData, setReportData] = useState<SeasonReportData>(emptySeasonReportData())

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    void onRefreshRoster()
  }, [activeTeamId, onRefreshRoster])

  useEffect(() => {
    setActiveTab('matches')
    setSelectedPlayerId(null)
  }, [activeTeamId])

  useEffect(() => {
    if (!activeTeamId) {
      setReportData(emptySeasonReportData())
      setLoading(false)
      setLoadError(null)
      return
    }

    let cancelled = false

    void (async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const data = await loadSeasonReport(activeTeamId, teamRoster)
        if (!cancelled) setReportData(data)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load season report')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeTeamId, teamRoster])

  const selectedPlayer = selectedPlayerId
    ? getPlayerFromRoster(teamRoster, selectedPlayerId)
    : null

  if (selectedPlayer && selectedPlayerId) {
    const stats =
      reportData.playerStats.get(selectedPlayerId) ??
      emptyPlayerSeasonStats(selectedPlayerId)

    return (
      <PlayerSeasonProfileView
        player={selectedPlayer}
        stats={stats}
        onBack={() => setSelectedPlayerId(null)}
      />
    )
  }

  const subtitleByTab: Record<ReportingTab, string> = {
    matches: 'Completed matches, scores, and coach summaries.',
    players: 'Season stats and coaching notes by player.',
    season: 'High-level season analytics and trends.',
  }

  return (
    <main className={`${APP_SHELL} pb-10 md:pb-12`}>
      <div className={`${APP_CONTAINER} space-y-5 pt-6 md:space-y-6 md:pt-8`}>
        <ScreenHeader
          title="Reporting"
          subtitle={subtitleByTab[activeTab]}
          onHome={onBackToHome}
          teamSwitcher={teamSwitcher}
        />

        {!activeTeamId ? (
          <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Select an active team above to view reports.
          </p>
        ) : loading ? (
          <p className="py-8 text-center text-sm font-semibold text-muted-foreground">
            Loading season report…
          </p>
        ) : loadError ? (
          <div className="rounded-xl border border-danger/40 bg-card p-6 text-center">
            <p className="font-bold text-danger">Failed to load season report</p>
            <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
          </div>
        ) : (
          <>
            <ReportingTabBar activeTab={activeTab} onTabChange={setActiveTab} />

            {activeTab === 'matches' ? (
              <PreviousMatchesTab
                data={reportData}
                pendingReviewMatches={pendingReviewMatches}
                onOpenPendingReview={onOpenPendingReview}
                onOpenMatchRecap={onOpenMatchRecap}
              />
            ) : null}

            {activeTab === 'players' ? (
              <PlayerBreakdownsTab
                roster={teamRoster}
                data={reportData}
                onSelectPlayer={setSelectedPlayerId}
              />
            ) : null}

            {activeTab === 'season' ? (
              <SeasonDetailsTab
                activeTeamName={activeTeamName}
                roster={teamRoster}
                data={reportData}
                onViewRecaps={onViewRecaps}
              />
            ) : null}
          </>
        )}
      </div>
    </main>
  )
}
