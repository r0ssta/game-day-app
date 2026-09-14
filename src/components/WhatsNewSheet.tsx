import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { Megaphone, X } from 'lucide-react'
import type { ChangelogRelease } from '@/data/changelog'
import { MODAL_OVERLAY, MODAL_PANEL, TOUCH_ICON_BUTTON } from '@/lib/layout'
import { cn } from '@/lib/utils'

const DISMISS_DISTANCE_PX = 80

type WhatsNewSheetProps = {
  open: boolean
  releases: ChangelogRelease[]
  onClose: () => void
}

export function WhatsNewSheet({ open, releases, onClose }: WhatsNewSheetProps) {
  const startYRef = useRef<number | null>(null)
  const [dragOffset, setDragOffset] = useState(0)

  useEffect(() => {
    if (!open) {
      setDragOffset(0)
      startYRef.current = null
      return
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const finishDrag = useCallback(
    (offset: number) => {
      startYRef.current = null
      if (offset >= DISMISS_DISTANCE_PX) {
        onClose()
        return
      }
      setDragOffset(0)
    },
    [onClose],
  )

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    startYRef.current = event.clientY
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (startYRef.current == null) return
    setDragOffset(Math.max(0, event.clientY - startYRef.current))
  }

  const onPointerUp = () => {
    if (startYRef.current == null) return
    finishDrag(dragOffset)
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      className={MODAL_OVERLAY}
      onClick={onClose}
    >
      <div
        className={cn(MODAL_PANEL, 'min-h-0 border-2 border-border')}
        style={dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none flex-col items-center py-3 active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="h-1.5 w-10 rounded-full bg-border" aria-hidden />
          <span className="sr-only">Swipe down to close</span>
        </div>

        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <Megaphone className="size-4 text-neon" strokeWidth={2.5} />
              Coach app
            </div>
            <h2
              id="whats-new-title"
              className="mt-1 font-display text-2xl font-black uppercase tracking-wide text-foreground"
            >
              What’s New
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={cn(TOUCH_ICON_BUTTON, 'border-2 border-border bg-secondary text-foreground')}
          >
            <X className="size-5" strokeWidth={2.5} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
          <ol className="space-y-5">
            {releases.map((release) => (
              <li key={release.version} className="border-t-2 border-border pt-4 first:border-t-0 first:pt-0">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  {release.date}
                </p>
                <h3 className="mt-1 font-display text-xl font-black uppercase tracking-wide text-foreground">
                  {release.title}
                </h3>
                <ul className="mt-3 space-y-2">
                  {release.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex gap-2 text-sm font-semibold leading-relaxed text-foreground"
                    >
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-neon" aria-hidden />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>

        <div className="shrink-0 border-t-2 border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 w-full touch-manipulation rounded-xl border-2 border-border bg-secondary px-4 text-xs font-bold uppercase tracking-wide text-foreground active:scale-[0.98]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
