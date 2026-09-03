import { useMemo } from 'react'

export function MatchCoachSelect({
  id,
  value,
  onChange,
  teamHeadCoaches,
  teamAssistants,
  allCoachNames,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  teamHeadCoaches: string[]
  teamAssistants: string[]
  allCoachNames: string[]
}) {
  const teamNames = useMemo(() => {
    const seen = new Set<string>()
    const ordered: Array<{ name: string; role: 'Head Coach' | 'Assistant Coach' }> = []
    for (const name of teamHeadCoaches) {
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      ordered.push({ name, role: 'Head Coach' })
    }
    for (const name of teamAssistants) {
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      ordered.push({ name, role: 'Assistant Coach' })
    }
    return ordered
  }, [teamHeadCoaches, teamAssistants])

  const otherCoaches = useMemo(() => {
    const teamKeys = new Set(teamNames.map((entry) => entry.name.toLowerCase()))
    return allCoachNames
      .filter((name) => name.trim() && !teamKeys.has(name.toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [allCoachNames, teamNames])

  const selectedValue = useMemo(() => {
    const needle = value.trim().toLowerCase()
    if (!needle) return ''
    const fromTeam = teamNames.find((entry) => entry.name.toLowerCase() === needle)
    if (fromTeam) return fromTeam.name
    const fromClub = otherCoaches.find((name) => name.toLowerCase() === needle)
    return fromClub ?? ''
  }, [value, teamNames, otherCoaches])

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-bold uppercase tracking-widest text-muted-foreground"
      >
        Head Coach
      </label>
      <select
        id={id}
        value={selectedValue}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold text-foreground focus:border-neon focus:outline-none focus:ring-2 focus:ring-neon/30"
      >
        <option value="" disabled>
          Select a coach…
        </option>
        {teamNames.length > 0 ? (
          <optgroup label="This team">
            {teamNames.map((entry) => (
              <option key={`${entry.role}-${entry.name}`} value={entry.name}>
                {entry.name} ({entry.role})
              </option>
            ))}
          </optgroup>
        ) : null}
        {otherCoaches.length > 0 ? (
          <optgroup label="Club directors & coaches">
            {otherCoaches.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
      {teamAssistants.length > 0 ? (
        <p className="mt-2 text-xs font-semibold text-muted-foreground">
          Assistant{teamAssistants.length === 1 ? '' : 's'} on this team:{' '}
          <span className="text-foreground">{teamAssistants.join(', ')}</span>
        </p>
      ) : null}
    </div>
  )
}
