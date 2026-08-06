import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function SoccerPitchSurface({ children }: { children: ReactNode }) {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border-2 border-white/30 bg-gradient-to-b from-emerald-600 to-emerald-700 shadow-inner">
      <div className="pointer-events-none absolute inset-0 opacity-20">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={cn('absolute inset-x-0 h-[12.5%]', i % 2 === 0 ? 'bg-emerald-500/40' : 'bg-transparent')}
            style={{ top: `${i * 12.5}%` }}
          />
        ))}
      </div>
      <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-white/70" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/70" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-[18%] w-[62%] -translate-x-1/2 border-2 border-b-0 border-white/70" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-[8%] w-[34%] -translate-x-1/2 border-2 border-b-0 border-white/70" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[18%] w-[62%] -translate-x-1/2 border-2 border-t-0 border-white/70" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[8%] w-[34%] -translate-x-1/2 border-2 border-t-0 border-white/70" />
      {children}
    </div>
  )
}
