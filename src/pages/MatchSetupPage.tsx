import { useMemo, useState, type MutableRefObject, type ReactNode } from 'react'
import { Share2 } from 'lucide-react'
import { ScreenHeader } from '@/components/AppNavigation'
import { AddPlayerToRoster } from '@/components/AddPlayerToRoster'
import { HomeAwayToggle } from '@/components/HomeAwayToggle'
import { MatchCoachSelect } from '@/components/MatchCoachSelect'
import { SubbingAssistantPanel } from '@/components/SubbingAssistantPanel'
import { TacticalPitchLineup } from '@/components/TacticalPitchLineup'
import { ENABLE_SUB_ASSISTANT } from '@/lib/feature-flags'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import { getMaxFieldPlayers } from '@/lib/lineup'
import { periodLengthOptions } from '@/lib/match-periods'
import {
  buildSidelineNameMap,
  formatPlayerFullName,
  getSidelineName,
} from '@/lib/player-names'
import { cn } from '@/lib/utils'
import type { FormationRole } from '@/lib/formations'
import type { LocationType } from '@/lib/match-location'
import type { SubFrequency } from '@/lib/sub-rotation'
import type { TeamFormat } from '@/lib/team-format'
import type { RosterPlayer, SetupLineup, TotalPeriods } from '@/types/match'

export type MatchSetupPageProps = {
  activeTeamId: string | null
  activeTeamName: string
  activeTeamFormat: TeamFormat
  teamSwitcher: ReactNode
  coachName: string
  onCoachNameChange: (value: string) => void
  teamHeadCoaches: string[]
  teamAssistants: string[]
  allCoachNames: string[]
  rosterLoading: boolean
  suggestedJersey: number
  onAddPlayer: (input: {
    firstName: string
    lastName: string
    jersey: number | null
    isGuest: boolean
    primaryPosition?: string
    secondaryPosition?: string
  }) => Promise<void>
  opponent: string
  onOpponentChange: (value: string) => void
  matchDate: string
  onMatchDateChange: (value: string) => void
  matchTime: string
  onMatchTimeChange: (value: string) => void
  locationType: LocationType
  onLocationTypeChange: (value: LocationType) => void
  tournamentGame: boolean
  onTournamentGameChange: (value: boolean) => void
  isTestMatch: boolean
  onIsTestMatchChange: (value: boolean) => void
  goesToPks: boolean
  onGoesToPksChange: (value: boolean) => void
  totalPeriods: TotalPeriods
  onTotalPeriodsChange: (value: TotalPeriods) => void
  /** When false, Match Format is locked to 2 halves (non-U9/U10). */
  allowThreePeriods: boolean
  halfLengthMinutes: number
  onHalfLengthChange: (value: number) => void
  gkPlaysFullHalf: boolean
  onGkPlaysFullHalfChange: (value: boolean) => void
  subFrequency: SubFrequency
  onSubFrequencyChange: (value: SubFrequency) => void
  onSetupSubIntervalMinutesChange: (minutes: number | null) => void
  masterRoster: RosterPlayer[]
  setupLineup: SetupLineup
  firstHalfFormation: string
  onSetFirstHalfFormation: (formationId: string) => void
  onSetAttending: (id: string, attending: boolean) => void
  onSetStartFirstHalf: (id: string, starts: boolean) => void
  onSetMatchPosition: (id: string, position: string) => void
  onEditPlayer: (id: string) => void
  onScheduleMatch: () => void
  onStartLiveNow: () => void
  canStartMatch: boolean
  startMatchBlockReason: string | null
  schedulingMatch?: boolean
  startingMatch?: boolean
  attendingCount: number
  lineupPresets: { id: string; preset_name: string }[]
  onLoadLineupPreset: (presetId: string) => void
  onBackToHome: () => void
  onShareParentHub?: () => void
  parentHubUrl?: string | null
  setupSlotAssignments?: Record<string, string | null>
  setupSlotLabelOverrides?: Record<string, string>
  onSetupSlotAssignmentsChange?: (assignments: Record<string, string | null>) => void
  onSetupSlotLabelOverridesChange?: (overrides: Record<string, string>) => void
  setupPitchKey: number
  setupAssignmentsRef: MutableRefObject<Record<string, string | null> | null>
  setupLabelOverridesRef?: MutableRefObject<Record<string, string> | null>
  guestAgeGroup: import('@/lib/age-groups').AgeGroup
  onAddGuestFromPool: (playerId: string) => Promise<void>
  loadAgeGroupPool: (ageGroup: import('@/lib/age-groups').AgeGroup) => Promise<import('@/types/database').DbPlayer[]>
}

export function MatchSetupPage({
  activeTeamId,
  activeTeamName,
  activeTeamFormat,
  teamSwitcher,
  coachName,
  onCoachNameChange,
  teamHeadCoaches,
  teamAssistants,
  allCoachNames,
  rosterLoading,
  suggestedJersey,
  onAddPlayer,
  opponent,
  onOpponentChange,
  matchDate,
  onMatchDateChange,
  matchTime,
  onMatchTimeChange,
  locationType,
  onLocationTypeChange,
  tournamentGame,
  onTournamentGameChange,
  isTestMatch,
  onIsTestMatchChange,
  goesToPks,
  onGoesToPksChange,
  totalPeriods,
  onTotalPeriodsChange,
  allowThreePeriods,
  halfLengthMinutes,
  onHalfLengthChange,
  gkPlaysFullHalf,
  onGkPlaysFullHalfChange,
  subFrequency,
  onSubFrequencyChange,
  onSetupSubIntervalMinutesChange,
  masterRoster,
  setupLineup,
  firstHalfFormation,
  onSetFirstHalfFormation,
  onSetAttending,
  onSetStartFirstHalf,
  onSetMatchPosition,
  onEditPlayer,
  onScheduleMatch,
  onStartLiveNow,
  canStartMatch,
  startMatchBlockReason,
  schedulingMatch,
  startingMatch,
  attendingCount,
  lineupPresets,
  onLoadLineupPreset,
  onBackToHome,
  onShareParentHub,
  parentHubUrl,
  setupSlotAssignments,
  setupSlotLabelOverrides,
  onSetupSlotAssignmentsChange,
  onSetupSlotLabelOverridesChange,
  setupPitchKey,
  setupAssignmentsRef,
  setupLabelOverridesRef,
  guestAgeGroup,
  onAddGuestFromPool,
  loadAgeGroupPool,
}: MatchSetupPageProps) {
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const maxFieldPlayers = getMaxFieldPlayers(activeTeamFormat)

  const attendingRoster = useMemo(
    () => masterRoster.filter((player) => setupLineup.attending[player.id]),
    [masterRoster, setupLineup.attending],
  )
  const sidelineNameMap = useMemo(
    () => buildSidelineNameMap(attendingRoster),
    [attendingRoster],
  )

  return (
    <main className={APP_SHELL}>
      <div className={`${APP_CONTAINER} space-y-3 pt-4 pb-40 md:pt-5 md:pb-44`}>
        <ScreenHeader
          title="Game Day Setup"
          subtitle={`Pre-game lineup and match details for ${activeTeamName}.`}
          onHome={onBackToHome}
          teamSwitcher={teamSwitcher}
        />

            <p className="rounded-xl border border-neon/30 bg-neon/5 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {activeTeamFormat} format · {maxFieldPlayers} on field
            </p>

            {onShareParentHub && parentHubUrl ? (
              <div className="space-y-2 rounded-xl border-2 border-border bg-card p-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Parent Team Hub
                </p>
                <p className="break-all font-mono text-xs font-semibold text-foreground">
                  {parentHubUrl}
                </p>
                {isTestMatch ? (
                  <p className="text-[11px] font-semibold text-amber-200">
                    Testing match is hidden from parents. Preview Hub shows it to you only — no
                    alerts.
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      window.open(
                        isTestMatch ? `${parentHubUrl}?preview=1` : parentHubUrl,
                        '_blank',
                        'noopener,noreferrer',
                      )
                    }
                    className="flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-neon bg-neon/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-foreground active:scale-[0.98]"
                  >
                    {isTestMatch ? 'Preview Hub' : 'Open Hub'}
                  </button>
                  <button
                    type="button"
                    onClick={onShareParentHub}
                    className="flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-border bg-background px-3 py-2 text-xs font-bold uppercase tracking-wide text-foreground active:scale-[0.98]"
                  >
                    <Share2 className="size-4" strokeWidth={2.5} />
                    Share
                  </button>
                </div>
              </div>
            ) : onShareParentHub ? (
              <button
                type="button"
                onClick={onShareParentHub}
                className="flex w-full min-h-12 touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-4 py-3 text-sm font-bold uppercase tracking-wide text-foreground active:scale-[0.98]"
              >
                <Share2 className="size-4" strokeWidth={2.5} />
                Share Team Hub
              </button>
            ) : null}

            <MatchCoachSelect
              id="head-coach"
              value={coachName}
              onChange={onCoachNameChange}
              teamHeadCoaches={teamHeadCoaches}
              teamAssistants={teamAssistants}
              allCoachNames={allCoachNames}
            />

            <div>
              <label
                htmlFor="opponent"
                className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
              >
                Opponent Name
              </label>
              <input
                id="opponent"
                type="text"
                value={opponent}
                onChange={(e) => onOpponentChange(e.target.value)}
                placeholder="e.g. Beach FC"
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold text-foreground placeholder:text-muted-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="match-date"
                  className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
                >
                  Game Date
                </label>
                <input
                  id="match-date"
                  type="date"
                  value={matchDate}
                  onChange={(e) => onMatchDateChange(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
                />
              </div>
              <div>
                <label
                  htmlFor="match-time"
                  className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
                >
                  Game Time
                </label>
                <input
                  id="match-time"
                  type="time"
                  value={matchTime}
                  onChange={(e) => onMatchTimeChange(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base font-semibold tabular-nums text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
                />
              </div>
            </div>

            <HomeAwayToggle value={locationType} onChange={onLocationTypeChange} />

            {masterRoster.length > 0 ? (
              <div
                aria-label="Attendance tracker"
                className="attendance-tracker rounded-2xl border-2 border-border bg-card p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="font-display text-sm font-black uppercase tracking-wide text-foreground">
                    Attendance Tracker
                  </h2>
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {attendingCount}/{masterRoster.length} attending
                  </span>
                </div>
                <ul className="space-y-2">
                  {masterRoster.map((player) => {
                    const isAttending = setupLineup.attending[player.id] !== false
                    return (
                      <li
                        key={player.id}
                        className="flex items-center gap-2 rounded-xl border-2 border-border bg-background px-3 py-2"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-neon/40 bg-neon/10 font-display text-sm font-bold tabular-nums text-neon">
                          {player.number ?? '—'}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
                          {formatPlayerFullName(player.firstName, player.lastName)}
                        </span>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            aria-pressed={isAttending}
                            onClick={() => onSetAttending(player.id, true)}
                            className={cn(
                              'min-h-10 touch-manipulation rounded-lg border-2 px-3 text-[10px] font-bold uppercase tracking-wide',
                              isAttending
                                ? 'border-neon bg-neon text-neon-foreground'
                                : 'border-border bg-secondary text-muted-foreground',
                            )}
                          >
                            Attending
                          </button>
                          <button
                            type="button"
                            aria-pressed={!isAttending}
                            onClick={() => onSetAttending(player.id, false)}
                            className={cn(
                              'min-h-10 touch-manipulation rounded-lg border-2 px-3 text-[10px] font-bold uppercase tracking-wide',
                              !isAttending
                                ? 'border-foreground bg-foreground text-background'
                                : 'border-border bg-secondary text-muted-foreground',
                            )}
                          >
                            Absent
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}

            <section aria-label="Lineup builder" className="space-y-3 pb-2">
              {rosterLoading ? (
                <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                  Loading roster…
                </p>
              ) : masterRoster.length === 0 ? (
                <div className="space-y-3">
                  <p className="rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                    No players on this team’s season roster yet. Add players in Team Management, or
                    add one below for this match.
                  </p>
                  <AddPlayerToRoster
                    selectedTeamId={activeTeamId}
                    ageGroup={guestAgeGroup}
                    excludePlayerIds={masterRoster.map((player) => player.id)}
                    loadAgeGroupPool={loadAgeGroupPool}
                    onAddFromPool={onAddGuestFromPool}
                    suggestedJersey={suggestedJersey}
                    onAdd={onAddPlayer}
                  />
                </div>
              ) : (
                <>
                  <p className="rounded-xl border border-neon/30 bg-neon/5 px-3 py-2 text-xs font-semibold text-muted-foreground">
                    Starting lineup is empty until you drag players from the bench onto the pitch.
                  </p>
                  {lineupPresets.length > 0 && (
                    <div>
                      <label
                        htmlFor="load-lineup-preset"
                        className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
                      >
                        Load Lineup Preset
                      </label>
                      <select
                        id="load-lineup-preset"
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
                  )}

                  <TacticalPitchLineup
                    key={`${activeTeamId ?? 'no-team'}-${setupPitchKey}`}
                    title="1st Half Lineup"
                    formationId={firstHalfFormation}
                    onFormationChange={onSetFirstHalfFormation}
                    initialSlotAssignments={setupSlotAssignments}
                    initialSlotLabelOverrides={setupSlotLabelOverrides}
                    assignmentsResetKey={setupPitchKey}
                    assignmentsRef={setupAssignmentsRef}
                    slotLabelOverridesRef={setupLabelOverridesRef}
                    onSlotAssignmentsChange={onSetupSlotAssignmentsChange}
                    onSlotLabelOverridesChange={onSetupSlotLabelOverridesChange}
                    constrainLists={false}
                    players={masterRoster.map((player) => ({
                      id: player.id,
                      name: formatPlayerFullName(player.firstName, player.lastName),
                      shortName: setupLineup.attending[player.id]
                        ? getSidelineName(player, sidelineNameMap)
                        : formatPlayerFullName(player.firstName, player.lastName),
                      number: player.number,
                      isGuest: player.isGuest,
                      primaryPosition: player.primaryPosition,
                      secondaryPosition: player.secondaryPosition,
                      meta: `Roster: ${player.position}`,
                    }))}
                    attending={setupLineup.attending}
                    starters={setupLineup.startFirstHalf}
                    maxFieldPlayers={maxFieldPlayers}
                    teamFormat={activeTeamFormat}
                    onAssignStarter={(playerId, _role: FormationRole, tacticalPosition) => {
                      onSetStartFirstHalf(playerId, true)
                      onSetMatchPosition(playerId, tacticalPosition)
                    }}
                    onRemoveStarter={(playerId) => onSetStartFirstHalf(playerId, false)}
                    onSetAttending={onSetAttending}
                    onEditPlayer={onEditPlayer}
                  />

                  <AddPlayerToRoster
                    selectedTeamId={activeTeamId}
                    ageGroup={guestAgeGroup}
                    excludePlayerIds={masterRoster.map((player) => player.id)}
                    loadAgeGroupPool={loadAgeGroupPool}
                    onAddFromPool={onAddGuestFromPool}
                    suggestedJersey={suggestedJersey}
                    onAdd={onAddPlayer}
                  />
                </>
              )}
            </section>

            <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
              <span className="text-sm font-bold text-foreground">Tournament Game</span>
              <button
                type="button"
                role="switch"
                aria-checked={tournamentGame}
                onClick={() => onTournamentGameChange(!tournamentGame)}
                className={cn(
                  'relative h-8 w-14 rounded-full transition-colors',
                  tournamentGame ? 'bg-neon' : 'bg-secondary',
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 size-6 rounded-full bg-white shadow transition-transform',
                    tournamentGame ? 'left-7' : 'left-1',
                  )}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">Testing match</p>
                <p className="text-xs text-muted-foreground">
                  Hidden from Parent Hub — no parent alerts
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isTestMatch}
                aria-label="Testing match"
                onClick={() => onIsTestMatchChange(!isTestMatch)}
                className={cn(
                  'relative h-8 w-14 shrink-0 rounded-full transition-colors',
                  isTestMatch ? 'bg-amber-500' : 'bg-secondary',
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 size-6 rounded-full bg-white shadow transition-transform',
                    isTestMatch ? 'left-7' : 'left-1',
                  )}
                />
              </button>
            </div>

            {tournamentGame ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-athletic/40 bg-athletic/10 px-4 py-3">
                <span className="text-sm font-bold text-foreground">
                  Would this game go to PKs if it ends in a tie?
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={goesToPks}
                  onClick={() => onGoesToPksChange(!goesToPks)}
                  className={cn(
                    'relative h-8 w-14 shrink-0 rounded-full transition-colors',
                    goesToPks ? 'bg-neon' : 'bg-secondary',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-1 size-6 rounded-full bg-white shadow transition-transform',
                      goesToPks ? 'left-7' : 'left-1',
                    )}
                  />
                </button>
              </div>
            ) : null}

            {allowThreePeriods ? (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Match Format
                </p>
                <div
                  role="radiogroup"
                  aria-label="Match format"
                  className="grid grid-cols-2 gap-2"
                >
                  {(
                    [
                      { value: 2 as TotalPeriods, label: '2 Halves' },
                      { value: 3 as TotalPeriods, label: '3 Periods' },
                    ] as const
                  ).map((option) => {
                    const selected = totalPeriods === option.value
                    const locked = tournamentGame
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={locked && option.value !== 2}
                        onClick={() => {
                          if (locked) return
                          onTotalPeriodsChange(option.value)
                        }}
                        className={cn(
                          'min-h-12 touch-manipulation rounded-xl border-2 px-3 py-2 text-center font-display text-sm font-black uppercase tracking-wide transition active:scale-[0.98]',
                          selected
                            ? 'border-neon bg-neon/15 text-foreground'
                            : 'border-border bg-background text-foreground',
                          locked && option.value !== 2 ? 'cursor-not-allowed opacity-40' : '',
                        )}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
                {tournamentGame ? (
                  <p className="mt-2 text-xs font-semibold text-muted-foreground">
                    Tournament games use 2 halves.
                  </p>
                ) : (
                  <p className="mt-2 text-xs font-semibold text-muted-foreground">
                    U9/U10 league games typically use 3 periods.
                  </p>
                )}
              </div>
            ) : null}

            <div>
              <label
                htmlFor="period-length"
                className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
              >
                {allowThreePeriods && totalPeriods === 3
                  ? 'Minutes per period'
                  : 'Half length (minutes)'}
              </label>
              <select
                id="period-length"
                value={halfLengthMinutes}
                onChange={(e) => onHalfLengthChange(Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
              >
                {periodLengthOptions(
                  allowThreePeriods && totalPeriods === 3 ? 3 : 2,
                ).map((mins) => (
                  <option key={mins} value={mins}>
                    {mins} minutes
                  </option>
                ))}
              </select>
            </div>

            {ENABLE_SUB_ASSISTANT ? (
              <SubbingAssistantPanel
                teamFormat={activeTeamFormat}
                halfLengthMinutes={halfLengthMinutes}
                totalPeriods={allowThreePeriods && totalPeriods === 3 ? 3 : 2}
                attendingCount={attendingCount}
                gkPlaysFullHalf={gkPlaysFullHalf}
                onGkPlaysFullHalfChange={onGkPlaysFullHalfChange}
                subFrequency={subFrequency}
                onSubFrequencyChange={onSubFrequencyChange}
                onIntervalMinutesChange={onSetupSubIntervalMinutesChange}
              />
            ) : null}
      </div>

      <div className="sticky bottom-0 z-20 space-y-2 border-t-2 border-border bg-background/95 px-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/90 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto w-full max-w-md space-y-2 md:max-w-2xl lg:max-w-4xl">
          <button
            type="button"
            onClick={onScheduleMatch}
            disabled={!canStartMatch || schedulingMatch || startingMatch}
            className="flex min-h-14 w-full touch-manipulation items-center justify-center gap-3 rounded-xl bg-neon py-5 text-neon-foreground shadow-lg shadow-neon/20 transition-transform active:scale-[0.98] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="font-display text-2xl font-bold uppercase tracking-wide sm:text-3xl">
              {schedulingMatch ? 'Saving…' : 'Schedule Match'}
            </span>
          </button>
          <button
            type="button"
            onClick={onStartLiveNow}
            disabled={!canStartMatch || schedulingMatch || startingMatch}
            className="flex min-h-12 w-full touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-border bg-card py-3 text-sm font-black uppercase tracking-wide text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {startingMatch ? 'Starting…' : 'Start Live Now'}
          </button>
          {!canStartMatch && startMatchBlockReason ? (
            <p className="text-center text-sm font-semibold text-muted-foreground">
              {startMatchBlockReason}
            </p>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              Schedule saves lineup without going live. Start Live Now opens the match screen
              immediately.
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
