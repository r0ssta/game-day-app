import { useEffect, useState } from 'react'
import { loadPlayerImpact, type PlayerImpactRow } from '@/lib/player-impact'

export function usePlayerImpact(input: {
  seasonId?: string | null
  teamId?: string | null
}) {
  const [rows, setRows] = useState<PlayerImpactRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!input.seasonId && !input.teamId) {
      setRows([])
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false

    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await loadPlayerImpact(input)
        if (!cancelled) setRows(data)
      } catch (err) {
        if (!cancelled) {
          setRows([])
          setError(err instanceof Error ? err.message : 'Failed to load player impact')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [input.seasonId, input.teamId, reloadToken])

  return {
    rows,
    loading,
    error,
    reload: () => setReloadToken((value) => value + 1),
  }
}
