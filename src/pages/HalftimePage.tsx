import { useMemo, useState, type MutableRefObject } from 'react'
import { ScreenHeader } from '@/components/AppNavigation'
import { TacticalPitchLineup } from '@/components/TacticalPitchLineup'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import { getMaxFieldPlayers, hasSlotAssignments } from '@/lib/lineup'
import {
  formatClock,
  formatMatchClockParts,
} from '@/lib/match-clock'
import {
  formatPeriodLong,
  intermissionTitle,
  startNextPeriodButtonLabel,
} from '@/lib/match-periods'
import { formatPlayingTimeBadge } from '@/lib/play-time'
import {
  buildSidelineNameMap,
  formatPlayerFullName,
  getSidelineName,
} from '@/lib/player-names'
import type { FormationRole } from '@/lib/formations'
import type { TeamFormat } from '@/lib/team-format'
import type { MatchPlayer, TotalPeriods } from '@/types/match'

export type HalftimePageProps = {
  teamName: string
  opponent: string
  seconds: number
  halfLengthMinutes: number
  endedPeriod: number
  nextPeriod: number
  totalPeriods: TotalPeriods
  players: MatchPlayer[]
  secondHalfFormation: string
  onSetSecondHalfFormation: (formationId: string) => void
  secondHalfStarters: Record<string, boolean>
  initialSlotAssignments?: Record<string, string | null>
  initialSlotLabelOverrides?: Record<string, string>
  assignmentsResetKey: string | number
  halftimeAssignmentsRef: MutableRefObject<Record<string, string | null> | null>
  halftimeLabelOverridesRef?: MutableRefObject<Record<string, string> | null>
  lineupPresets: { id: string; preset_name: string }[]
  onLoadLineupPreset: (presetId: string) => void
  onAssignSecondHalfStarter: (playerId: string, role: FormationRole, tacticalPosition: string) => void
  onRemoveSecondHalfStarter: (playerId: string) => void
  onBeginSecondHalf: () => void
  canBeginSecondHalf: boolean
  onBackToHome: () => void
  activeTeamFormat: TeamFormat
}

export function HalftimePage({
  teamName,
  opponent,
  seconds,
  halfLengthMinutes,
  endedPeriod,
  nextPeriod,
  totalPeriods,
  players,
  secondHalfFormation,
  onSetSecondHalfFormation,
  secondHalfStarters,
  initialSlotAssignments,
  initialSlotLabelOverrides,
  assignmentsResetKey,
  halftimeAssignmentsRef,
  halftimeLabelOverridesRef,
  lineupPresets,
  onLoadLineupPreset,
  onAssignSecondHalfStarter,
  onRemoveSecondHalfStarter,
  onBeginSecondHalf,
  canBeginSecondHalf,
  onBackToHome,
  activeTeamFormat,
}: HalftimePageProps) {
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const maxFieldPlayers = getMaxFieldPlayers(activeTeamFormat)
  const attendingPlayers = players.filter((p) => p.attending)
  const sidelineNameMap = useMemo(
    () => buildSidelineNameMap(attendingPlayers),
    [attendingPlayers],
  )
  const firstHalfClock = formatMatchClockParts(seconds)
  const firstHalfEndedLabel = firstHalfClock.addedLabel
    ? `${firstHalfClock.regulation} ${firstHalfClock.addedLabel}`
    : firstHalfClock.regulation
  const title = intermissionTitle(endedPeriod, totalPeriods)
  const endedLabel = formatPeriodLong(endedPeriod, totalPeriods)
  const startNextLabel = startNextPeriodButtonLabel(nextPeriod, totalPeriods)

  return (
    <main className={APP_SHELL}>
      <div className={`${APP_CONTAINER} space-y-3 pt-4 md:pt-5`}>
        <ScreenHeader
          title={title}
          subtitle={`${teamName.trim() || 'Home'} vs ${opponent.trim() || 'Opponent'} · ${endedLabel} ended at ${firstHalfEndedLabel} / ${formatClock(halfLengthMinutes * 60)}`}
          onHome={onBackToHome}
        />

        {lineupPresets.length > 0 ? (
          <div>
            <label
              htmlFor="load-halftime-preset"
              className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              Load Lineup Preset
            </label>
            <select
              id="load-halftime-preset"
              value={selectedPresetId}
              onChange={(e) => {
                const presetId = e.target.value
                setSelectedPresetId(presetId)
                if (presetId) onLoadLineupPreset(presetId)
              }}
              className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
            >
              <option value="">Choose a saved lineup…</option>
              {lineupPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.preset_name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <TacticalPitchLineup
          title={`${formatPeriodLong(nextPeriod, totalPeriods)} Lineup`}
          formationId={secondHalfFormation}
          onFormationChange={onSetSecondHalfFormation}
          initialSlotAssignments={
            hasSlotAssignments(initialSlotAssignments) ? initialSlotAssignments : undefined
          }
          initialSlotLabelOverrides={initialSlotLabelOverrides}
          assignmentsResetKey={assignmentsResetKey}
          hydrateFromStarters
          assignmentsRef={halftimeAssignmentsRef}
          slotLabelOverridesRef={halftimeLabelOverridesRef}
          constrainLists={false}
          players={attendingPlayers.map((player) => ({
            id: player.id,
            name: formatPlayerFullName(player.firstName, player.lastName),
            shortName: getSidelineName(player, sidelineNameMap),
            number: player.number,
            isGuest: player.isGuest,
            matchPosition: player.matchPosition,
            minutesLabel: formatPlayingTimeBadge(player.totalSecondsPlayed),
            didNotStartFirstHalf: !player.isFirstHalfStarter,
            meta: player.matchPosition,
          }))}
          attending={Object.fromEntries(attendingPlayers.map((p) => [p.id, true]))}
          starters={secondHalfStarters}
          maxFieldPlayers={maxFieldPlayers}
          teamFormat={activeTeamFormat}
          onAssignStarter={onAssignSecondHalfStarter}
          onRemoveStarter={onRemoveSecondHalfStarter}
        />
      </div>

      <div className="sticky bottom-0 z-20 border-t-2 border-border bg-background/95 px-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/90 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto w-full max-w-md md:max-w-2xl lg:max-w-4xl">
          <button
            type="button"
            onClick={onBeginSecondHalf}
            disabled={!canBeginSecondHalf}
            className="flex w-full min-h-14 touch-manipulation items-center justify-center gap-3 rounded-2xl bg-neon py-5 text-neon-foreground shadow-xl shadow-neon/30 transition-transform active:scale-[0.98] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="font-display text-2xl font-black uppercase tracking-wide">
              {startNextLabel}
            </span>
          </button>
        </div>
      </div>
    </main>
  )
}
