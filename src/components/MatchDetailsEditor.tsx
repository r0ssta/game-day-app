import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import {
  periodLengthOptions,
  resolveTotalPeriods,
  type TotalPeriods,
} from '@/lib/match-periods'
import { formatVenueLabel, type LocationType } from '@/lib/match-location'
import {
  formatMatchDisplayDateTime,
  matchDateTimeIso,
} from '@/lib/match-schedule'
import { formatSupabaseError, updateMatchRecord } from '@/lib/supabase-api'
import { cn } from '@/lib/utils'

export type MatchDetailsSaved = {
  opponent: string
  periodLengthMinutes: number
  locationType: LocationType
  matchDate: string
  matchTime: string
}

type MatchDetailsEditorProps = {
  matchId: string
  opponent: string
  periodLengthMinutes: number
  locationType: LocationType
  matchDate: string
  matchTime: string
  totalPeriods?: number | null
  onSaved: (next: MatchDetailsSaved) => void
  onToast: (message: string) => void
}

function lengthOptions(totalPeriods: TotalPeriods, current: number): number[] {
  const options = periodLengthOptions(totalPeriods)
  if (options.includes(current as (typeof options)[number])) return [...options]
  return [...options, current].sort((a, b) => a - b)
}

function dbMatchTime(value: string): string {
  const trimmed = value.trim()
  return trimmed.length === 5 ? `${trimmed}:00` : trimmed
}

export function MatchDetailsEditor({
  matchId,
  opponent,
  periodLengthMinutes,
  locationType,
  matchDate,
  matchTime,
  totalPeriods,
  onSaved,
  onToast,
}: MatchDetailsEditorProps) {
  const resolvedPeriods = resolveTotalPeriods({ total_periods: totalPeriods ?? 2 })
  const lengthLabel = resolvedPeriods === 3 ? 'Minutes per period' : 'Half length (minutes)'
  const [editing, setEditing] = useState(false)
  const [draftOpponent, setDraftOpponent] = useState(opponent)
  const [draftLength, setDraftLength] = useState(periodLengthMinutes)
  const [draftLocation, setDraftLocation] = useState(locationType)
  const [draftDate, setDraftDate] = useState(matchDate)
  const [draftTime, setDraftTime] = useState(matchTime)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editing) return
    setDraftOpponent(opponent)
    setDraftLength(periodLengthMinutes)
    setDraftLocation(locationType)
    setDraftDate(matchDate)
    setDraftTime(matchTime)
  }, [editing, opponent, periodLengthMinutes, locationType, matchDate, matchTime])

  const syncDrafts = () => {
    setDraftOpponent(opponent)
    setDraftLength(periodLengthMinutes)
    setDraftLocation(locationType)
    setDraftDate(matchDate)
    setDraftTime(matchTime)
  }

  const beginEdit = () => {
    syncDrafts()
    setEditing(true)
  }

  const cancelEdit = () => {
    syncDrafts()
    setEditing(false)
  }

  const save = async () => {
    const nextOpponent = draftOpponent.trim()
    const nextLength = Number(draftLength)
    const nextDate = draftDate.trim()
    const nextTime = draftTime.trim().slice(0, 5)
    if (!nextDate) {
      onToast('Choose a valid game date')
      return
    }
    if (!/^\d{2}:\d{2}$/.test(nextTime)) {
      onToast('Choose a valid kickoff time')
      return
    }
    if (!Number.isFinite(nextLength) || nextLength <= 0) {
      onToast('Choose a valid match length')
      return
    }
    setSaving(true)
    try {
      await updateMatchRecord(matchId, {
        opponent: nextOpponent,
        half_length: nextLength,
        period_length: nextLength,
        match_date: nextDate,
        match_time: dbMatchTime(nextTime),
        date: matchDateTimeIso(nextDate, nextTime),
        location: draftLocation,
        location_type: draftLocation,
      })
      onSaved({
        opponent: nextOpponent,
        periodLengthMinutes: nextLength,
        locationType: draftLocation,
        matchDate: nextDate,
        matchTime: nextTime,
      })
      setEditing(false)
      onToast('Match details updated')
    } catch (err) {
      onToast(formatSupabaseError(err) || 'Could not update match details')
    } finally {
      setSaving(false)
    }
  }

  const { dateLabel, timeLabel } = formatMatchDisplayDateTime({
    date: matchDateTimeIso(matchDate, matchTime),
    match_date: matchDate,
    match_time: matchTime,
  })

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Match Details
        </h2>
        {editing ? null : (
          <button
            type="button"
            onClick={beginEdit}
            className="flex min-h-9 touch-manipulation items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-foreground active:scale-[0.98]"
          >
            <Pencil className="size-3.5" strokeWidth={2.5} />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-3 space-y-3">
          <div>
            <label
              htmlFor="recap-opponent"
              className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              Opponent Name
            </label>
            <input
              id="recap-opponent"
              type="text"
              value={draftOpponent}
              onChange={(e) => setDraftOpponent(e.target.value)}
              placeholder="e.g. Beach FC"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base font-semibold text-foreground placeholder:text-muted-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="recap-match-date"
                className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
              >
                Game Date
              </label>
              <input
                id="recap-match-date"
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
              />
            </div>
            <div>
              <label
                htmlFor="recap-match-time"
                className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
              >
                Kickoff Time
              </label>
              <input
                id="recap-match-time"
                type="time"
                value={draftTime}
                onChange={(e) => setDraftTime(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base font-semibold tabular-nums text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
              />
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Home / Away
            </span>
            <div
              role="group"
              aria-label="Home or Away"
              className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-background p-1"
            >
              {(['home', 'away'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={draftLocation === option}
                  onClick={() => setDraftLocation(option)}
                  className={cn(
                    'rounded-lg py-3 text-sm font-bold uppercase tracking-wide transition-colors active:scale-[0.98]',
                    draftLocation === option
                      ? option === 'home'
                        ? 'bg-neon text-neon-foreground shadow-sm'
                        : 'bg-athletic text-athletic-foreground shadow-sm'
                      : 'text-muted-foreground',
                  )}
                >
                  {formatVenueLabel(option)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label
              htmlFor="recap-period-length"
              className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              {lengthLabel}
            </label>
            <select
              id="recap-period-length"
              value={draftLength}
              onChange={(e) => setDraftLength(Number(e.target.value))}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
            >
              {lengthOptions(resolvedPeriods, draftLength).map((mins) => (
                <option key={mins} value={mins}>
                  {mins} minutes
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="min-h-11 flex-1 touch-manipulation rounded-xl border-2 border-neon bg-neon px-3 text-xs font-black uppercase tracking-wide text-neon-foreground active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="min-h-11 flex-1 touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-xs font-black uppercase tracking-wide text-foreground active:scale-[0.98] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Date
            </dt>
            <dd className="mt-0.5 font-semibold text-foreground">{dateLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Kickoff
            </dt>
            <dd className="mt-0.5 font-semibold text-foreground">{timeLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Venue
            </dt>
            <dd className="mt-0.5 font-semibold text-foreground">{formatVenueLabel(locationType)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {lengthLabel}
            </dt>
            <dd className="mt-0.5 font-semibold text-foreground">{periodLengthMinutes} minutes</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Opponent
            </dt>
            <dd className="mt-0.5 font-semibold text-foreground">{opponent.trim() || 'Opponent'}</dd>
          </div>
        </dl>
      )}
    </section>
  )
}
