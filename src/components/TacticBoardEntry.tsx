import { useState } from 'react'
import { ModalSuspense } from '@/components/Spinner'
import { lazyWithChunkReload } from '@/lib/lazy-import'
import type { TacticBoardPhase } from '@/lib/tactic-board'
import type { TeamFormat } from '@/lib/team-format'

const TacticBoardSheet = lazyWithChunkReload(() =>
  import('@/components/TacticBoard').then((m) => ({ default: m.TacticBoardSheet })),
)

export function TacticBoardEntry({
  teamId,
  matchId,
  phase,
  format = '9v9',
}: {
  teamId: string | null
  matchId: string | null
  phase: TacticBoardPhase
  format?: TeamFormat
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full touch-manipulation items-center justify-center rounded-xl border-2 border-border bg-card px-4 py-3 text-sm font-bold uppercase tracking-wide text-foreground active:scale-[0.98]"
      >
        Tactic Board
      </button>
      {open ? (
        <ModalSuspense>
          <TacticBoardSheet
            teamId={teamId}
            matchId={matchId}
            phase={phase}
            format={format}
            onClose={() => setOpen(false)}
          />
        </ModalSuspense>
      ) : null}
    </>
  )
}
