import { useMatchState } from '@/hooks/useMatchState'

/**
 * Compatibility composer for the coach app.
 * Domain state lives in `useRoster`, `useStaffAuth`, and `useMatchState`;
 * `useMatchState` wires those hooks and exposes the previous public surface.
 */
export function useGameDayApp() {
  return useMatchState()
}

export { useMatchState } from '@/hooks/useMatchState'
export { useRoster } from '@/hooks/useRoster'
export { useStaffAuth } from '@/hooks/useStaffAuth'
