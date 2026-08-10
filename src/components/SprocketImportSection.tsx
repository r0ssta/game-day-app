import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { CalendarPlus, CheckCircle2, FileUp, Loader2, Upload, XCircle } from 'lucide-react'
import { formatMatchDisplayDateTime } from '@/lib/match-schedule'
import {
  formatOpponentPrefix,
  resolveMatchLocationType,
  type LocationType,
} from '@/lib/match-location'
import { parseSprocketRosterCsv } from '@/lib/sprocket-csv'
import { parseSprocketScheduleIcs } from '@/lib/sprocket-ics'
import { cn } from '@/lib/utils'
import type { DbMatch } from '@/types/database'

export type SprocketAddPlayerInput = {
  firstName: string
  lastName: string
  jersey: number | null
  isGuest: boolean
  primaryPosition?: string
  secondaryPosition?: string
}

export type SprocketScheduledMatchInput = {
  opponent: string
  locationType: LocationType
  matchDate: string
  matchTime: string
}

type ImportStatusTone = 'success' | 'partial' | 'error' | 'info'

type ImportStatus = {
  tone: ImportStatusTone
  title: string
  detail?: string
}

type SprocketImportSectionProps = {
  activeTeamId: string | null
  activeTeamName: string
  scheduledMatches: DbMatch[]
  scheduledLoading: boolean
  onRefreshScheduledMatches: () => Promise<void>
  onAddPlayer: (input: SprocketAddPlayerInput) => Promise<unknown>
  onCreateScheduledMatch: (input: SprocketScheduledMatchInput) => Promise<unknown>
  onDeleteScheduledMatch: (matchId: string) => Promise<void>
  onUseScheduledMatch: (match: DbMatch) => void
  onToast: (message: string) => void
}

function statusClasses(tone: ImportStatusTone): string {
  switch (tone) {
    case 'success':
      return 'sprocket-import-status sprocket-import-status--success border-2 border-neon bg-neon/15 text-foreground'
    case 'partial':
      return 'sprocket-import-status sprocket-import-status--partial border-2 border-athletic bg-athletic/15 text-foreground'
    case 'error':
      return 'sprocket-import-status sprocket-import-status--error border-2 border-danger bg-danger/15 text-foreground'
    default:
      return 'sprocket-import-status sprocket-import-status--info border-2 border-border bg-secondary text-foreground'
  }
}

function StatusBanner({ status }: { status: ImportStatus }) {
  const Icon = status.tone === 'error' ? XCircle : CheckCircle2
  return (
    <div role="status" className={cn('rounded-xl px-4 py-3', statusClasses(status.tone))}>
      <p className="flex items-start gap-2 text-sm font-extrabold leading-snug">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{status.title}</span>
      </p>
      {status.detail ? (
        <p className="mt-1 pl-6 text-xs font-semibold text-foreground/90">{status.detail}</p>
      ) : null}
    </div>
  )
}

export function SprocketImportSection({
  activeTeamId,
  activeTeamName,
  scheduledMatches,
  scheduledLoading,
  onRefreshScheduledMatches,
  onAddPlayer,
  onCreateScheduledMatch,
  onDeleteScheduledMatch,
  onUseScheduledMatch,
  onToast,
}: SprocketImportSectionProps) {
  const csvInputRef = useRef<HTMLInputElement>(null)
  const icsInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState<'csv' | 'ics' | null>(null)
  const [importing, setImporting] = useState<'csv' | 'ics' | null>(null)
  const [status, setStatus] = useState<ImportStatus | null>(null)

  useEffect(() => {
    if (!activeTeamId) return
    void onRefreshScheduledMatches()
  }, [activeTeamId, onRefreshScheduledMatches])

  const disabled = !activeTeamId || importing !== null

  const importRosterFile = useCallback(
    async (file: File) => {
      if (!activeTeamId) {
        setStatus({
          tone: 'error',
          title: 'Select an active team before importing a roster.',
        })
        return
      }

      setImporting('csv')
      setStatus({ tone: 'info', title: `Importing roster from ${file.name}…` })

      try {
        const text = await file.text()
        const parsed = parseSprocketRosterCsv(text)

        if (parsed.players.length === 0) {
          const firstSkip = parsed.skipped[0]?.reason
          setStatus({
            tone: 'error',
            title: 'No players imported from CSV.',
            detail: firstSkip ?? 'Check that the file includes Name (or First/Last) columns.',
          })
          return
        }

        let imported = 0
        const failures: string[] = []

        for (const player of parsed.players) {
          try {
            await onAddPlayer({
              firstName: player.firstName,
              lastName: player.lastName,
              jersey: player.jersey,
              isGuest: false,
              primaryPosition: player.primaryPosition,
              secondaryPosition: player.primaryPosition,
            })
            imported += 1
          } catch (err) {
            failures.push(
              `Row ${player.rowNumber}: ${err instanceof Error ? err.message : 'Failed to add'}`,
            )
          }
        }

        const skipCount = parsed.skipped.length
        const warnText = [
          ...parsed.warnings,
          skipCount > 0 ? `${skipCount} row(s) skipped` : '',
          failures.length > 0 ? `${failures.length} row(s) failed to save` : '',
        ]
          .filter(Boolean)
          .join(' · ')

        if (imported === 0) {
          setStatus({
            tone: 'error',
            title: 'Roster import failed.',
            detail: warnText || failures[0] || 'No players were saved.',
          })
          return
        }

        const tone: ImportStatusTone =
          failures.length > 0 || skipCount > 0 || parsed.warnings.length > 0 ? 'partial' : 'success'
        setStatus({
          tone,
          title: `Successfully imported ${imported} player${imported === 1 ? '' : 's'}.`,
          detail: warnText || undefined,
        })
        onToast(`Imported ${imported} player${imported === 1 ? '' : 's'} from Sprocket CSV`)
      } catch (err) {
        setStatus({
          tone: 'error',
          title: 'Could not read roster CSV.',
          detail: err instanceof Error ? err.message : 'Unknown error',
        })
      } finally {
        setImporting(null)
        if (csvInputRef.current) csvInputRef.current.value = ''
      }
    },
    [activeTeamId, onAddPlayer, onToast],
  )

  const importScheduleFile = useCallback(
    async (file: File) => {
      if (!activeTeamId) {
        setStatus({
          tone: 'error',
          title: 'Select an active team before importing a schedule.',
        })
        return
      }

      setImporting('ics')
      setStatus({ tone: 'info', title: `Importing schedule from ${file.name}…` })

      try {
        const text = await file.text()
        const parsed = parseSprocketScheduleIcs(text, { teamName: activeTeamName })

        if (parsed.matches.length === 0) {
          setStatus({
            tone: 'error',
            title: 'No matches imported from calendar file.',
            detail: parsed.skipped[0]?.reason ?? 'Check that the ICS file contains VEVENT entries.',
          })
          return
        }

        let imported = 0
        const failures: string[] = []

        for (const match of parsed.matches) {
          try {
            await onCreateScheduledMatch({
              opponent: match.opponent,
              locationType: match.locationType,
              matchDate: match.matchDate,
              matchTime: match.matchTime === '00:00' ? '12:00' : match.matchTime,
            })
            imported += 1
          } catch (err) {
            failures.push(
              `${match.summary}: ${err instanceof Error ? err.message : 'Failed to create match'}`,
            )
          }
        }

        await onRefreshScheduledMatches()

        const skipCount = parsed.skipped.length
        const warnText = [
          ...parsed.warnings,
          skipCount > 0 ? `${skipCount} event(s) skipped` : '',
          failures.length > 0 ? `${failures.length} match(es) failed to save` : '',
          'Defaults used: 30-min halves, non-tournament, team primary coach.',
        ]
          .filter(Boolean)
          .join(' · ')

        if (imported === 0) {
          setStatus({
            tone: 'error',
            title: 'Schedule import failed.',
            detail: warnText || failures[0] || 'No matches were saved.',
          })
          return
        }

        const tone: ImportStatusTone =
          failures.length > 0 || skipCount > 0 || parsed.warnings.length > 0 ? 'partial' : 'success'
        setStatus({
          tone,
          title: `Successfully imported ${imported} upcoming match${imported === 1 ? '' : 'es'}.`,
          detail: warnText,
        })
        onToast(`Imported ${imported} match${imported === 1 ? '' : 'es'} from Sprocket calendar`)
      } catch (err) {
        setStatus({
          tone: 'error',
          title: 'Could not read calendar ICS file.',
          detail: err instanceof Error ? err.message : 'Unknown error',
        })
      } finally {
        setImporting(null)
        if (icsInputRef.current) icsInputRef.current.value = ''
      }
    },
    [
      activeTeamId,
      activeTeamName,
      onCreateScheduledMatch,
      onRefreshScheduledMatches,
      onToast,
    ],
  )

  const handleFiles = (files: FileList | null, kind: 'csv' | 'ics') => {
    const file = files?.[0]
    if (!file) return
    if (kind === 'csv') void importRosterFile(file)
    else void importScheduleFile(file)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>, kind: 'csv' | 'ics') => {
    event.preventDefault()
    setDragOver(null)
    if (disabled) return
    handleFiles(event.dataTransfer.files, kind)
  }

  return (
    <section className="space-y-4 rounded-xl border-2 border-border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-foreground">
          <Upload className="size-5 text-athletic" />
          Sprocket Sports Integration
        </h2>
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          Import a Sprocket roster CSV or schedule ICS for{' '}
          <span className="text-foreground">{activeTeamName || 'the active team'}</span>.
        </p>
      </div>

      {!activeTeamId ? (
        <p className="rounded-xl border-2 border-border bg-secondary px-4 py-3 text-sm font-extrabold text-foreground">
          Select an active team to enable Sprocket imports.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div
              onDragOver={(e) => {
                e.preventDefault()
                if (!disabled) setDragOver('csv')
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => onDrop(e, 'csv')}
              className={cn(
                'rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors',
                dragOver === 'csv' ? 'border-neon bg-neon/10' : 'border-border bg-background',
                disabled && 'opacity-50',
              )}
            >
              <FileUp className="mx-auto size-6 text-athletic" />
              <p className="mt-2 text-sm font-extrabold text-foreground">Roster CSV</p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                Maps Name, Jersey #, and Position
              </p>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={disabled}
                onChange={(e) => handleFiles(e.target.files, 'csv')}
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => csvInputRef.current?.click()}
                className="mt-3 w-full rounded-lg border-2 border-foreground/80 bg-card px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide text-foreground disabled:opacity-40"
              >
                {importing === 'csv' ? 'Importing…' : 'Choose CSV'}
              </button>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault()
                if (!disabled) setDragOver('ics')
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => onDrop(e, 'ics')}
              className={cn(
                'rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors',
                dragOver === 'ics' ? 'border-neon bg-neon/10' : 'border-border bg-background',
                disabled && 'opacity-50',
              )}
            >
              <CalendarPlus className="mx-auto size-6 text-athletic" />
              <p className="mt-2 text-sm font-extrabold text-foreground">Schedule ICS</p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                Creates upcoming matches for New Game setup
              </p>
              <input
                ref={icsInputRef}
                type="file"
                accept=".ics,text/calendar"
                className="sr-only"
                disabled={disabled}
                onChange={(e) => handleFiles(e.target.files, 'ics')}
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => icsInputRef.current?.click()}
                className="mt-3 w-full rounded-lg border-2 border-foreground/80 bg-card px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide text-foreground disabled:opacity-40"
              >
                {importing === 'ics' ? 'Importing…' : 'Choose ICS'}
              </button>
            </div>
          </div>

          {importing ? (
            <p className="flex items-center gap-2 text-sm font-extrabold text-foreground">
              <Loader2 className="size-4 animate-spin" />
              Working…
            </p>
          ) : null}

          {status ? <StatusBanner status={status} /> : null}

          <div className="space-y-2">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-foreground">
              Upcoming imported matches
            </h3>
            {scheduledLoading ? (
              <p className="text-sm font-semibold text-muted-foreground">Loading schedule…</p>
            ) : scheduledMatches.length === 0 ? (
              <p className="rounded-lg border-2 border-dashed border-border px-3 py-4 text-sm font-semibold text-muted-foreground">
                No scheduled matches yet. Import an ICS calendar to populate this list.
              </p>
            ) : (
              <ul className="space-y-2">
                {scheduledMatches.map((match) => {
                  const { dateLabel, timeLabel } = formatMatchDisplayDateTime(match)
                  const locationType = resolveMatchLocationType(match)
                  return (
                    <li
                      key={match.id}
                      className="rounded-xl border-2 border-border bg-background px-3 py-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-extrabold text-foreground">
                            {formatOpponentPrefix(locationType)} {match.opponent.trim() || 'Opponent'}
                          </p>
                          <p className="text-xs font-bold text-muted-foreground">
                            {dateLabel} · {timeLabel}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => onUseScheduledMatch(match)}
                            className="flex-1 rounded-lg bg-neon px-3 py-2 text-xs font-extrabold uppercase text-neon-foreground sm:flex-none"
                          >
                            New Game
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void onDeleteScheduledMatch(match.id).then(() =>
                                onToast('Removed scheduled match'),
                              )
                            }
                            className="rounded-lg border-2 border-danger/60 bg-danger/10 px-3 py-2 text-xs font-extrabold uppercase text-danger"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  )
}
