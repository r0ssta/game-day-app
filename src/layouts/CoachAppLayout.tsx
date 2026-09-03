import type { ReactNode } from 'react'
import {
  AppNavDrawer,
  AppNavShell,
  type AppNavItem,
  type AppNavSection,
} from '@/components/AppNavDrawer'
import { ScreenSuspense } from '@/components/Spinner'

type CoachAppLayoutProps = {
  navOpen: boolean
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
  toast?: ReactNode
  children: ReactNode
}

export function CoachAppLayout({
  navOpen,
  onOpenChange,
  items,
  onNavigate,
  teams,
  activeTeamId,
  onTeamChange,
  teamSwitchDisabled,
  teamLabel,
  staffRoleLabel,
  userEmail,
  onSignOut,
  toast,
  children,
}: CoachAppLayoutProps) {
  return (
    <>
      <AppNavDrawer
        open={navOpen}
        onOpenChange={onOpenChange}
        items={items}
        onNavigate={onNavigate}
        teams={teams}
        activeTeamId={activeTeamId}
        onTeamChange={onTeamChange}
        teamSwitchDisabled={teamSwitchDisabled}
        teamLabel={teamLabel}
        staffRoleLabel={staffRoleLabel}
        userEmail={userEmail}
        onSignOut={onSignOut}
      />
      <AppNavShell>
        <ScreenSuspense>{children}</ScreenSuspense>
      </AppNavShell>
      {toast}
    </>
  )
}
