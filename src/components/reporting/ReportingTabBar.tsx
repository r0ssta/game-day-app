import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ReportingTab = 'matches' | 'players' | 'season'

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-11 flex-1 touch-manipulation items-center justify-center rounded-lg px-1.5 py-3 text-[10px] font-bold uppercase tracking-wide transition-colors active:scale-[0.98] sm:text-xs',
        active ? 'bg-neon text-neon-foreground' : 'bg-secondary text-muted-foreground',
      )}
    >
      {children}
    </button>
  )
}

type ReportingTabBarProps = {
  activeTab: ReportingTab
  onTabChange: (tab: ReportingTab) => void
}

export function ReportingTabBar({ activeTab, onTabChange }: ReportingTabBarProps) {
  return (
    <div
      role="tablist"
      aria-label="Reporting sections"
      className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-card p-1"
    >
      <TabButton active={activeTab === 'matches'} onClick={() => onTabChange('matches')}>
        Previous Matches
      </TabButton>
      <TabButton active={activeTab === 'players'} onClick={() => onTabChange('players')}>
        Player Breakdowns
      </TabButton>
      <TabButton active={activeTab === 'season'} onClick={() => onTabChange('season')}>
        Season Details
      </TabButton>
    </div>
  )
}
