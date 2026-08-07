import { useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type AnalyticsModuleProps = {
  title: string
  description: string
  icon: LucideIcon
  defaultOpen?: boolean
  summary?: string
  children: ReactNode
}

export function AnalyticsModule({
  title,
  description,
  icon: Icon,
  defaultOpen = false,
  summary,
  children,
}: AnalyticsModuleProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-secondary/40"
        aria-expanded={open}
      >
        <Icon className="mt-0.5 size-5 shrink-0 text-athletic" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-foreground">{title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
          {summary && !open ? (
            <span className="mt-1 block text-xs font-semibold text-neon">{summary}</span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            'mt-0.5 size-5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open ? <div className="space-y-4 border-t border-border px-4 py-4">{children}</div> : null}
    </section>
  )
}

export function ProgressBar({
  value,
  max,
  className,
  tone = 'neon',
}: {
  value: number
  max: number
  className?: string
  tone?: 'neon' | 'danger'
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-secondary', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-all',
          tone === 'danger' ? 'bg-danger' : 'bg-neon',
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
