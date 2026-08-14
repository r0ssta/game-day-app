import { CLUB_CREST_SRC, CLUB_NAME, CLUB_NAME_FULL } from '@/lib/branding'
import { cn } from '@/lib/utils'

type ClubBrandMarkProps = {
  className?: string
  /** compact = crest + short name; hero = larger crest for auth/home */
  size?: 'sm' | 'md' | 'lg'
  showName?: boolean
  align?: 'left' | 'center'
}

const CREST_SIZE = {
  sm: 'size-9',
  md: 'size-12',
  lg: 'size-16',
} as const

export function ClubBrandMark({
  className,
  size = 'md',
  showName = true,
  align = 'left',
}: ClubBrandMarkProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3',
        align === 'center' && 'flex-col text-center',
        className,
      )}
    >
      <img
        src={CLUB_CREST_SRC}
        alt={`${CLUB_NAME_FULL} crest`}
        className={cn(
          CREST_SIZE[size],
          'shrink-0 object-contain drop-shadow-md',
          align === 'center' && size === 'lg' && 'size-20',
        )}
        width={size === 'lg' ? 80 : size === 'md' ? 48 : 36}
        height={size === 'lg' ? 80 : size === 'md' ? 48 : 36}
      />
      {showName ? (
        <div className={cn(align === 'center' && 'space-y-1')}>
          {align === 'center' ? (
            <>
              <p className="font-display text-3xl font-black uppercase tracking-wide text-foreground leading-none sm:text-4xl">
                {CLUB_NAME}
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-athletic">
                Game Day
              </p>
            </>
          ) : (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-athletic">
                {CLUB_NAME_FULL}
              </p>
              <p className="font-display text-lg font-bold uppercase tracking-wide text-foreground leading-none">
                {CLUB_NAME}
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
