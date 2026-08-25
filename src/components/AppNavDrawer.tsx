import { useEffect, type ReactNode } from 'react'
import {
  BarChart3,
  History,
  Home,
  Menu,
  Play,
  Shield,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { SunlightModeToggle } from '@/components/SunlightModeToggle'
import { GlobalTeamSelector } from '@/components/GlobalTeamSelector'
import { ClubBrandMark } from '@/components/ClubBrandMark'
import { CLUB_CREST_SRC, CLUB_SHORT_NAME } from '@/lib/branding'
import { APP_CONTAINER, TOUCH_ICON_BUTTON } from '@/lib/layout'
import { cn } from '@/lib/utils'

export type AppNavSection = 'home' | 'active_match' | 'season' | 'recaps' | 'roster' | 'club_admin'

export type AppNavItem = {
  id: AppNavSection
  label: string
  description: string
  icon: LucideIcon
  disabled?: boolean
  active?: boolean
}

type AppNavDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: AppNavItem[]
  onNavigate: (section: AppNavSection) => void
  teams: Array<{ id: string; name: string }>
  activeTeamId: string | null
  onTeamChange: (teamId: string) => void
  teamSwitchDisabled?: boolean
  teamLabel?: string
  staffRoleLabel?: string | null
  userEmail?: string | null
  onSignOut?: () => void
}

export function buildAppNavItems(input: {
  activeSection: AppNavSection | null
  teamReady: boolean
  hasLiveMatch: boolean
  showClubAdmin?: boolean
}): AppNavItem[] {
  const teamDisabled = !input.teamReady

  const items: AppNavItem[] = [
    {
      id: 'home',
      label: 'Home / Dashboard',
      description: 'Team selector and quick actions',
      icon: Home,
      active: input.activeSection === 'home',
    },
    {
      id: 'active_match',
      label: 'Active Match / Lineup',
      description: input.hasLiveMatch
        ? 'Return to the live match or halftime setup'
        : 'Pre-game setup and lineup',
      icon: Play,
      disabled: teamDisabled,
      active: input.activeSection === 'active_match',
    },
    {
      id: 'season',
      label: 'Season Details & Analytics',
      description: 'Season record, dashboards, and trends',
      icon: BarChart3,
      disabled: teamDisabled,
      active: input.activeSection === 'season',
    },
    {
      id: 'recaps',
      label: 'Match History & Game Recaps',
      description: 'Browse and edit finished match recaps',
      icon: History,
      disabled: teamDisabled,
      active: input.activeSection === 'recaps',
    },
    {
      id: 'roster',
      label: 'Team Roster & Settings',
      description: 'Players, presets, and team settings',
      icon: Users,
      disabled: teamDisabled,
      active: input.activeSection === 'roster',
    },
  ]

  if (input.showClubAdmin) {
    items.push({
      id: 'club_admin',
      label: 'Club Admin',
      description: 'Roles, team assignments, and access',
      icon: Shield,
      active: input.activeSection === 'club_admin',
    })
  }

  return items
}

export function resolveActiveNavSection(appMode: string, reportingTab?: string): AppNavSection | null {
  if (appMode === 'home') return 'home'
  if (appMode === 'match' || appMode === 'match_setup' || appMode === 'halftime' || appMode === 'penalty_shootout') return 'active_match'
  if (appMode === 'reporting' && reportingTab === 'season') return 'season'
  if (appMode === 'recap_history' || appMode === 'recap') return 'recaps'
  if (appMode === 'team') return 'roster'
  if (appMode === 'club_admin') return 'club_admin'
  if (appMode === 'reporting') return 'recaps'
  return null
}

function NavDrawerLink({
  item,
  onSelect,
}: {
  item: AppNavItem
  onSelect: () => void
}) {
  const Icon = item.icon

  return (
    <li>
      <button
        type="button"
        disabled={item.disabled}
        onClick={onSelect}
        className={cn(
          'flex w-full touch-manipulation items-start gap-3 rounded-xl border-2 px-4 py-3.5 text-left transition-transform active:scale-[0.98]',
          item.active
            ? 'border-neon bg-neon/15 text-foreground ring-1 ring-neon/40'
            : 'border-border bg-card text-foreground',
          item.disabled && 'cursor-not-allowed opacity-50 active:scale-100',
        )}
      >
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl',
            item.active ? 'bg-neon/20' : 'bg-secondary',
          )}
        >
          <Icon className="size-5" strokeWidth={2.5} />
        </span>
        <span className="min-w-0">
          <span className="block font-display text-sm font-bold uppercase tracking-wide">
            {item.label}
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {item.description}
          </span>
        </span>
      </button>
    </li>
  )
}

export function AppNavDrawer({
  open,
  onOpenChange,
  items,
  onNavigate,
  teams,
  activeTeamId,
  onTeamChange,
  teamSwitchDisabled = false,
  teamLabel,
  staffRoleLabel,
  userEmail,
  onSignOut,
}: AppNavDrawerProps) {
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onOpenChange])

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[70] border-b-2 border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <div className={`${APP_CONTAINER} flex h-14 items-center gap-2 sm:gap-3`}>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="app-nav-drawer"
            aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => onOpenChange(!open)}
            className={cn(
              TOUCH_ICON_BUTTON,
              'shrink-0 border-2 border-border bg-card text-foreground shadow-sm',
              open && 'border-neon bg-neon/10',
            )}
          >
            {open ? <X className="size-5" strokeWidth={2.5} /> : <Menu className="size-5" strokeWidth={2.5} />}
          </button>

          <GlobalTeamSelector
            variant="header"
            teams={teams}
            activeTeamId={activeTeamId}
            onTeamChange={onTeamChange}
            disabled={teamSwitchDisabled}
            disabledReason={teamSwitchDisabled ? 'Team locked during live match' : undefined}
          />

          <img
            src={CLUB_CREST_SRC}
            alt={CLUB_SHORT_NAME}
            className="ml-auto size-9 shrink-0 object-contain"
            width={36}
            height={36}
          />

          <SunlightModeToggle className="shrink-0 shadow-sm" />
        </div>
      </header>

      {open ? (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-[75] bg-background/70 backdrop-blur-[1px]"
          onClick={() => onOpenChange(false)}
        />
      ) : null}

      <aside
        id="app-nav-drawer"
        aria-hidden={!open}
        className={cn(
          'fixed inset-y-0 left-0 z-[80] flex w-[min(100vw-3rem,20rem)] flex-col border-r-2 border-border bg-card shadow-2xl transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-full pointer-events-none',
        )}
      >
        <div className="space-y-3 border-b border-border px-4 py-3">
          <div className="min-w-0 space-y-2">
            <ClubBrandMark size="sm" />
            {teamLabel ? (
              <p className="truncate text-xs text-muted-foreground">Viewing {teamLabel}</p>
            ) : null}
          </div>
          <GlobalTeamSelector
            variant="panel"
            teams={teams}
            activeTeamId={activeTeamId}
            onTeamChange={(teamId) => {
              onTeamChange(teamId)
              onOpenChange(false)
            }}
            disabled={teamSwitchDisabled}
            disabledReason={teamSwitchDisabled ? 'Team locked during live match' : undefined}
          />
        </div>
        <div className="flex h-11 items-center justify-end border-b border-border px-4">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => onOpenChange(false)}
            className={cn(TOUCH_ICON_BUTTON, 'border-2 border-border bg-secondary text-foreground')}
          >
            <X className="size-5" strokeWidth={2.5} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain p-4">
          <ul className="space-y-2">
            {items.map((item) => (
              <NavDrawerLink
                key={item.id}
                item={item}
                onSelect={() => {
                  if (item.disabled) return
                  onNavigate(item.id)
                  onOpenChange(false)
                }}
              />
            ))}
          </ul>
        </nav>

        <div className="space-y-2 border-t border-border p-4">
          {staffRoleLabel || userEmail ? (
            <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2">
              {staffRoleLabel ? (
                <p className="text-[10px] font-bold uppercase tracking-widest text-athletic">
                  {staffRoleLabel}
                </p>
              ) : null}
              {userEmail ? (
                <p className="truncate text-xs font-semibold text-muted-foreground">{userEmail}</p>
              ) : null}
            </div>
          ) : null}
          {onSignOut ? (
            <button
              type="button"
              onClick={() => {
                onSignOut()
                onOpenChange(false)
              }}
              className="min-h-11 w-full touch-manipulation rounded-xl border-2 border-border bg-card px-4 text-xs font-bold uppercase tracking-wide text-foreground active:scale-[0.98]"
            >
              Sign Out
            </button>
          ) : null}
        </div>
      </aside>
    </>
  )
}

export function AppNavShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden pt-14">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  )
}
