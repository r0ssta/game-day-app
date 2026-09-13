import { cn } from '@/lib/utils'
import type { MatchPresenceMember } from '@/lib/match-presence'

const AVATAR_TONES = [
  'bg-neon text-neon-foreground',
  'bg-athletic text-white',
  'bg-secondary text-foreground',
] as const

function viewingLabel(count: number): string {
  return count === 1 ? '1 other coach viewing' : `${count} other coaches viewing`
}

export function StaffPresenceCluster({ members }: { members: MatchPresenceMember[] }) {
  if (members.length === 0) return null

  const shown = members.slice(0, 3)
  const extra = members.length - shown.length
  const label = viewingLabel(members.length)
  const names = members.map((member) => member.name).join(', ')

  return (
    <div
      className="flex min-w-0 max-w-[9.5rem] items-center gap-1.5 sm:max-w-[14rem]"
      title={names}
    >
      <ul className="flex items-center pl-2" aria-hidden>
        {shown.map((member, index) => (
          <li
            key={member.userId}
            className={cn(
              'relative -ml-2 flex size-7 items-center justify-center rounded-full border-2 border-background text-[10px] font-black',
              AVATAR_TONES[index % AVATAR_TONES.length],
            )}
          >
            {index === 0 ? (
              <span className="absolute -right-0.5 -top-0.5 size-2 animate-pulse rounded-full bg-emerald-400 ring-2 ring-background" />
            ) : null}
            {member.initials}
          </li>
        ))}
        {extra > 0 ? (
          <li className="relative -ml-2 flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-black text-muted-foreground">
            +{extra}
          </li>
        ) : null}
      </ul>
      <p className="truncate text-[10px] font-semibold leading-tight text-muted-foreground">
        {label}
      </p>
      <span className="sr-only">
        {label}: {names}
      </span>
    </div>
  )
}
