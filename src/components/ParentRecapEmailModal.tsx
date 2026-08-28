import { useEffect, useMemo, useState } from 'react'
import { ClipboardCopy, Mail, Sparkles, X } from 'lucide-react'
import {
  aggregateParentRecapPlayerLines,
  buildParentRecapEmailDraft,
  draftParentFacingRecapWithAi,
  isParentRecapAiDraftEnabled,
} from '@/lib/parent-recap'
import { buildDisciplineCardSummaries } from '@/lib/match-cards'
import { formatMatchDisplayDateTime } from '@/lib/match-schedule'
import { saveParentFacingRecap } from '@/lib/supabase-api'
import { MODAL_OVERLAY, MODAL_PANEL, TOUCH_ICON_BUTTON } from '@/lib/layout'
import { cn } from '@/lib/utils'
import type { DbMatch, DbMatchEvent } from '@/types/database'
import type { MatchPlayer, RosterPlayer } from '@/types/match'
import { formatMatchResultScore } from '@/lib/penalty-kicks'

type ParentRecapEmailModalProps = {
  open: boolean
  match: DbMatch
  teamName: string
  events: DbMatchEvent[]
  players: Array<
    Pick<MatchPlayer, 'id' | 'firstName' | 'lastName' | 'matchPosition'> & {
      attending?: boolean
    }
  >
  onClose: () => void
  onToast: (message: string) => void
  onParentFacingRecapSaved?: (value: string) => void
}

function rosterToParentPlayers(roster: RosterPlayer[]): ParentRecapEmailModalProps['players'] {
  return roster.map((player) => ({
    id: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    matchPosition: player.position || '—',
    attending: true,
  }))
}

export function playersFromRoster(roster: RosterPlayer[]) {
  return rosterToParentPlayers(roster)
}

export function ParentRecapEmailModal({
  open,
  match,
  teamName,
  events,
  players,
  onClose,
  onToast,
  onParentFacingRecapSaved,
}: ParentRecapEmailModalProps) {
  const [parentFacingRecap, setParentFacingRecap] = useState('')
  const [focusForNextWeek, setFocusForNextWeek] = useState('')
  const [saving, setSaving] = useState(false)
  const [draftingAi, setDraftingAi] = useState(false)
  const aiEnabled = isParentRecapAiDraftEnabled()

  const { dateLabel } = formatMatchDisplayDateTime(match)
  const opponent = match.opponent.trim() || 'Opponent'
  const halfLengthSeconds = Math.max(1, match.half_length) * 60

  useEffect(() => {
    if (!open) return
    setParentFacingRecap(match.parent_facing_recap?.trim() ?? '')
    setFocusForNextWeek('')
  }, [open, match.id, match.parent_facing_recap])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving && !draftingAi) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving, draftingAi, onClose])

  const playerLines = useMemo(
    () => aggregateParentRecapPlayerLines(events, halfLengthSeconds, players),
    [events, halfLengthSeconds, players],
  )

  const disciplineLines = useMemo(
    () => buildDisciplineCardSummaries(events, players).map((row) => row.label),
    [events, players],
  )

  const draft = useMemo(
    () =>
      buildParentRecapEmailDraft({
        teamName,
        opponent,
        matchDateLabel: dateLabel,
        parentFacingRecap,
        focusForNextWeek,
        playerLines,
        disciplineLines,
      }),
    [
      teamName,
      opponent,
      dateLabel,
      parentFacingRecap,
      focusForNextWeek,
      playerLines,
      disciplineLines,
    ],
  )

  if (!open) return null

  const handleSaveRecap = async () => {
    setSaving(true)
    try {
      await saveParentFacingRecap(match.id, parentFacingRecap)
      onParentFacingRecapSaved?.(parentFacingRecap.trim())
      onToast('Parent recap saved')
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to save parent recap')
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`).then(
      () => onToast('Parent recap copied'),
      () => onToast('Could not copy to clipboard'),
    )
  }

  const handleEmail = () => {
    const subject = encodeURIComponent(draft.subject)
    const body = encodeURIComponent(draft.body)
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  const handleDraftWithAi = async () => {
    setDraftingAi(true)
    try {
      const text = await draftParentFacingRecapWithAi(match.internal_coach_notes ?? '', {
        teamName,
        opponent,
        scoreLine: formatMatchResultScore(match),
      })
      setParentFacingRecap(text)
      onToast('AI draft ready — review before sending')
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'AI draft failed')
    } finally {
      setDraftingAi(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="parent-recap-title"
      className={MODAL_OVERLAY}
      onClick={() => {
        if (!saving && !draftingAi) onClose()
      }}
    >
      <div
        className={cn(
          MODAL_PANEL,
          'parent-recap-dialog max-w-lg border-2 border-border',
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-border px-5 pb-3 pt-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Weekly parent email
            </p>
            <h2
              id="parent-recap-title"
              className="mt-1 font-display text-xl font-black uppercase tracking-wide text-foreground"
            >
              Parent Recap
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving || draftingAi}
            aria-label="Close"
            className={cn(
              TOUCH_ICON_BUTTON,
              'border-2 border-border bg-secondary text-foreground disabled:opacity-50',
            )}
          >
            <X className="size-5" strokeWidth={2.5} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Game summary (parent-facing)
            </span>
            <textarea
              value={parentFacingRecap}
              onChange={(event) => setParentFacingRecap(event.target.value)}
              rows={5}
              placeholder="Write a balanced, constructive summary for parents…"
              className="min-h-28 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-3 py-2 text-sm font-semibold leading-relaxed text-foreground"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || draftingAi}
              onClick={() => void handleSaveRecap()}
              className="min-h-11 touch-manipulation rounded-xl border-2 border-border bg-secondary px-3 text-xs font-bold uppercase tracking-wide text-foreground disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save summary'}
            </button>
            {aiEnabled ? (
              <button
                type="button"
                disabled={saving || draftingAi}
                onClick={() => void handleDraftWithAi()}
                className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 rounded-xl border-2 border-athletic bg-athletic/15 px-3 text-xs font-bold uppercase tracking-wide text-foreground disabled:opacity-50"
              >
                <Sparkles className="size-4" strokeWidth={2.5} />
                {draftingAi ? 'Drafting…' : 'Draft with AI'}
              </button>
            ) : null}
          </div>

          {match.internal_coach_notes?.trim() ? (
            <details className="rounded-xl border-2 border-dashed border-border bg-secondary/40 px-3 py-2">
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Internal coach notes (staff only)
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-foreground">
                {match.internal_coach_notes.trim()}
              </p>
            </details>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Focus for next week
            </span>
            <input
              type="text"
              value={focusForNextWeek}
              onChange={(event) => setFocusForNextWeek(event.target.value)}
              placeholder="e.g. First touch under pressure"
              className="min-h-12 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-bold text-foreground"
            />
          </label>

          <div className="space-y-2 rounded-xl border-2 border-border bg-card p-3">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Email preview
            </p>
            <p className="text-sm font-black text-foreground">
              Subject: {draft.subject}
            </p>
            <pre className="parent-recap-preview whitespace-pre-wrap rounded-lg border-2 border-border bg-background px-3 py-3 font-sans text-sm font-semibold leading-relaxed text-foreground">
              {draft.body}
            </pre>
            <p className="text-[11px] font-bold text-muted-foreground">
              Player minutes exclude plus/minus and developmental ratings.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t-2 border-border px-5 py-4 sm:flex-row">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex min-h-12 flex-1 touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-border bg-secondary px-4 text-sm font-bold uppercase tracking-wide text-foreground"
          >
            <ClipboardCopy className="size-4" strokeWidth={2.5} />
            Copy to Clipboard
          </button>
          <button
            type="button"
            onClick={handleEmail}
            className="inline-flex min-h-12 flex-1 touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-neon bg-neon px-4 text-sm font-bold uppercase tracking-wide text-neon-foreground"
          >
            <Mail className="size-4" strokeWidth={2.5} />
            Send via Email
          </button>
        </div>
      </div>
    </div>
  )
}
