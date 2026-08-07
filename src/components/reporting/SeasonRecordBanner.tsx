import { Trophy } from 'lucide-react'
import { formatSeasonRecordSummary, type SeasonRecord } from '@/lib/season-reporting'

type SeasonRecordBannerProps = {
  record: SeasonRecord
}

export function SeasonRecordBanner({ record }: SeasonRecordBannerProps) {
  if (record.matchesPlayed === 0) return null

  return (
    <section className="rounded-xl border border-neon/30 bg-neon/5 p-4">
      <div className="flex items-start gap-3">
        <Trophy className="mt-0.5 size-5 shrink-0 text-neon" />
        <div className="min-w-0">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Season Record
          </h2>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-foreground">
            {formatSeasonRecordSummary(record)}
          </p>
        </div>
      </div>
    </section>
  )
}
