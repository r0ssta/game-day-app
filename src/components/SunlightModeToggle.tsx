import { Moon, Sun } from 'lucide-react'
import { useSunlightMode } from '@/contexts/SunlightModeContext'
import { cn } from '@/lib/utils'

type SunlightModeToggleProps = {
  className?: string
  floating?: boolean
}

export function SunlightModeToggle({ className, floating = false }: SunlightModeToggleProps) {
  const { sunlightMode, toggleSunlightMode } = useSunlightMode()

  return (
    <button
      type="button"
      onClick={toggleSunlightMode}
      aria-pressed={sunlightMode}
      aria-label={sunlightMode ? 'Disable sunlight mode' : 'Enable sunlight mode'}
      title={sunlightMode ? 'Switch to dark mode' : 'Sunlight mode — high contrast for outdoors'}
      className={cn(
        'flex touch-manipulation items-center gap-2 rounded-full border-2 px-3 py-2 text-xs font-bold uppercase tracking-wide shadow-sm transition-transform active:scale-95',
        floating && 'fixed left-3 top-3 z-[70] min-h-11 shadow-md',
        sunlightMode
          ? 'border-foreground bg-foreground text-background'
          : cn(
              'border-border bg-card text-foreground',
              floating &&
                'backdrop-blur-sm supports-[backdrop-filter]:bg-background/95',
            ),
        className,
      )}
    >
      {sunlightMode ? (
        <>
          <Moon className="size-4 shrink-0" strokeWidth={2.5} />
          <span className="hidden sm:inline">Dark Mode</span>
        </>
      ) : (
        <>
          <Sun className="size-4 shrink-0" strokeWidth={2.5} />
          <span className="hidden sm:inline">Sunlight</span>
        </>
      )}
    </button>
  )
}
