import {
  DEFAULT_PRIMARY_POSITION,
  DEFAULT_SECONDARY_POSITION,
  ROSTER_PROFILE_POSITIONS,
  type RosterProfilePosition,
} from '@/lib/positions'

type RosterPositionFieldsProps = {
  idPrefix?: string
  primaryPosition: RosterProfilePosition
  secondaryPosition: RosterProfilePosition
  onPrimaryChange: (value: RosterProfilePosition) => void
  onSecondaryChange: (value: RosterProfilePosition) => void
  compact?: boolean
}

const selectClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30'

export function RosterPositionFields({
  idPrefix = 'roster',
  primaryPosition,
  secondaryPosition,
  onPrimaryChange,
  onSecondaryChange,
  compact = false,
}: RosterPositionFieldsProps) {
  const labelClass = compact
    ? 'mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground'
    : 'mb-1.5 block text-xs font-bold uppercase tracking-widest text-muted-foreground'

  return (
    <div className={compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
      <div>
        <label htmlFor={`${idPrefix}-primary-position`} className={labelClass}>
          Primary Position
        </label>
        <select
          id={`${idPrefix}-primary-position`}
          value={primaryPosition}
          onChange={(e) => onPrimaryChange(e.target.value as RosterProfilePosition)}
          required
          className={selectClass}
        >
          {ROSTER_PROFILE_POSITIONS.map((position) => (
            <option key={position} value={position}>
              {position}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-secondary-position`} className={labelClass}>
          Secondary Position
        </label>
        <select
          id={`${idPrefix}-secondary-position`}
          value={secondaryPosition}
          onChange={(e) => onSecondaryChange(e.target.value as RosterProfilePosition)}
          required
          className={selectClass}
        >
          {ROSTER_PROFILE_POSITIONS.map((position) => (
            <option key={position} value={position}>
              {position}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export { DEFAULT_PRIMARY_POSITION, DEFAULT_SECONDARY_POSITION }
