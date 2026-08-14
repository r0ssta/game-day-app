import { useState, type FormEvent } from 'react'
import { Archive, CalendarDays, CheckCircle2, Pencil, X } from 'lucide-react'
import {
  dateToMonthValue,
  defaultSeasonMonthValues,
  formatSeasonDateRange,
  monthValueToDate,
} from '@/lib/season-dates'
import type { DbSeason } from '@/types/database'
import { cn } from '@/lib/utils'

export type SeasonFormInput = {
  name: string
  startsOn: string | null
  endsOn: string | null
}

type SeasonManagerPanelProps = {
  seasons: DbSeason[]
  activeSeasonId: string | null
  onCreateSeason: (input: SeasonFormInput) => Promise<unknown>
  onUpdateSeason: (seasonId: string, input: SeasonFormInput) => Promise<unknown>
  onActivateSeason: (seasonId: string) => Promise<unknown>
  onArchiveSeason: (seasonId: string) => Promise<unknown>
  onToast: (message: string) => void
}

function parseSeasonForm(input: {
  name: string
  startMonth: string
  endMonth: string
}): SeasonFormInput | { error: string } {
  const trimmed = input.name.trim()
  if (!trimmed) return { error: 'Enter a season name' }
  const startsOn = monthValueToDate(input.startMonth)
  const endsOn = monthValueToDate(input.endMonth)
  if (!startsOn || !endsOn) return { error: 'Choose start and end months' }
  if (endsOn < startsOn) return { error: 'End month must be on or after the start month' }
  return { name: trimmed, startsOn, endsOn }
}

export function SeasonManagerPanel({
  seasons,
  activeSeasonId,
  onCreateSeason,
  onUpdateSeason,
  onActivateSeason,
  onArchiveSeason,
  onToast,
}: SeasonManagerPanelProps) {
  const defaults = defaultSeasonMonthValues()
  const [name, setName] = useState('')
  const [startMonth, setStartMonth] = useState(defaults.startMonth)
  const [endMonth, setEndMonth] = useState(defaults.endMonth)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editStartMonth, setEditStartMonth] = useState('')
  const [editEndMonth, setEditEndMonth] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const beginEdit = (season: DbSeason) => {
    setEditingId(season.id)
    setEditName(season.name)
    setEditStartMonth(dateToMonthValue(season.starts_on) || defaults.startMonth)
    setEditEndMonth(dateToMonthValue(season.ends_on) || defaults.endMonth)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditStartMonth('')
    setEditEndMonth('')
  }

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = parseSeasonForm({ name, startMonth, endMonth })
    if ('error' in parsed) {
      onToast(parsed.error)
      return
    }
    setCreating(true)
    try {
      await onCreateSeason(parsed)
      setName('')
      const next = defaultSeasonMonthValues()
      setStartMonth(next.startMonth)
      setEndMonth(next.endMonth)
      onToast(`Created ${parsed.name}`)
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to create season')
    } finally {
      setCreating(false)
    }
  }

  const handleSaveEdit = async (event: FormEvent) => {
    event.preventDefault()
    if (!editingId) return
    const parsed = parseSeasonForm({
      name: editName,
      startMonth: editStartMonth,
      endMonth: editEndMonth,
    })
    if ('error' in parsed) {
      onToast(parsed.error)
      return
    }
    setSavingEdit(true)
    try {
      await onUpdateSeason(editingId, parsed)
      onToast(`Updated ${parsed.name}`)
      cancelEdit()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to update season')
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <section className="season-manager-panel mt-6 space-y-4 rounded-2xl border-2 border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="size-5 text-athletic" strokeWidth={2.5} />
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
          Season Manager
        </h2>
      </div>
      <p className="text-xs font-semibold text-muted-foreground">
        The active season is the global default for rosters, matches, and stats. Archived seasons
        stay available as read-only history.
      </p>

      <form onSubmit={(event) => void handleCreate(event)} className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder='e.g. Fall 2026'
          className="min-h-12 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-semibold text-foreground"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Start (month)
            </span>
            <input
              type="month"
              value={startMonth}
              onChange={(event) => setStartMonth(event.target.value)}
              required
              className="min-h-12 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-semibold text-foreground"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              End (month)
            </span>
            <input
              type="month"
              value={endMonth}
              onChange={(event) => setEndMonth(event.target.value)}
              required
              className="min-h-12 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-semibold text-foreground"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="min-h-12 w-full touch-manipulation rounded-xl border-2 border-neon bg-neon px-4 text-sm font-bold uppercase tracking-wide text-neon-foreground disabled:opacity-50 sm:w-auto"
        >
          {creating ? 'Creating…' : 'Create Season'}
        </button>
      </form>

      <ul className="space-y-2">
        {seasons.map((season) => {
          const isActive = season.id === activeSeasonId || season.status === 'active'
          const busy = busyId === season.id
          const dateRange = formatSeasonDateRange(season.starts_on, season.ends_on)
          const isEditing = editingId === season.id

          if (isEditing) {
            return (
              <li
                key={season.id}
                className={cn(
                  'rounded-xl border-2 px-3 py-3',
                  isActive ? 'border-neon bg-neon/10' : 'border-border bg-background',
                )}
              >
                <form onSubmit={(event) => void handleSaveEdit(event)} className="space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className="min-h-11 w-full touch-manipulation rounded-xl border-2 border-border bg-card px-3 text-sm font-semibold text-foreground"
                    placeholder="Season name"
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block space-y-1.5">
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        Start (month)
                      </span>
                      <input
                        type="month"
                        value={editStartMonth}
                        onChange={(event) => setEditStartMonth(event.target.value)}
                        required
                        className="min-h-11 w-full touch-manipulation rounded-xl border-2 border-border bg-card px-3 text-sm font-semibold text-foreground"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        End (month)
                      </span>
                      <input
                        type="month"
                        value={editEndMonth}
                        onChange={(event) => setEditEndMonth(event.target.value)}
                        required
                        className="min-h-11 w-full touch-manipulation rounded-xl border-2 border-border bg-card px-3 text-sm font-semibold text-foreground"
                      />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={savingEdit}
                      className="min-h-11 flex-1 touch-manipulation rounded-xl border-2 border-neon bg-neon px-3 text-xs font-bold uppercase tracking-wide text-neon-foreground disabled:opacity-50"
                    >
                      {savingEdit ? 'Saving…' : 'Save Season'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={savingEdit}
                      className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border-2 border-border bg-card text-foreground disabled:opacity-50"
                      aria-label="Cancel edit"
                    >
                      <X className="size-4" strokeWidth={2.5} />
                    </button>
                  </div>
                </form>
              </li>
            )
          }

          return (
            <li
              key={season.id}
              className={cn(
                'rounded-xl border-2 px-3 py-3',
                isActive ? 'border-neon bg-neon/10' : 'border-border bg-background',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{season.name}</p>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {isActive ? 'Active' : 'Archived'}
                    {dateRange ? ` · ${dateRange}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy || savingEdit}
                  onClick={() => beginEdit(season)}
                  className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border-2 border-border bg-card text-foreground disabled:opacity-50"
                  aria-label={`Edit ${season.name}`}
                >
                  <Pencil className="size-4" strokeWidth={2.5} />
                </button>
                {!isActive ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setBusyId(season.id)
                      void onActivateSeason(season.id)
                        .then(() => onToast(`Activated ${season.name}`))
                        .catch((err) =>
                          onToast(err instanceof Error ? err.message : 'Failed to activate'),
                        )
                        .finally(() => setBusyId(null))
                    }}
                    className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 rounded-xl border-2 border-athletic bg-athletic/10 px-3 text-xs font-bold uppercase tracking-wide text-foreground disabled:opacity-50"
                  >
                    <CheckCircle2 className="size-4" strokeWidth={2.5} />
                    Set Active
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setBusyId(season.id)
                      void onArchiveSeason(season.id)
                        .then(() => onToast(`Archived ${season.name}`))
                        .catch((err) =>
                          onToast(err instanceof Error ? err.message : 'Failed to archive'),
                        )
                        .finally(() => setBusyId(null))
                    }}
                    className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 rounded-xl border-2 border-border bg-card px-3 text-xs font-bold uppercase tracking-wide text-foreground disabled:opacity-50"
                  >
                    <Archive className="size-4" strokeWidth={2.5} />
                    Archive
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
