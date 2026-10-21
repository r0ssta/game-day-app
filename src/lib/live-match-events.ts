import type { DbMatchEvent } from '@/types/database'

type Listener = (matchId: string, events: DbMatchEvent[]) => void

let cachedMatchId: string | null = null
let cachedEvents: DbMatchEvent[] = []
const listeners = new Set<Listener>()

function sameEventList(prev: DbMatchEvent[], next: DbMatchEvent[]): boolean {
  if (prev.length !== next.length) return false
  for (let index = 0; index < prev.length; index += 1) {
    const left = prev[index]
    const right = next[index]
    if (!left || !right) return false
    if (left.id !== right.id || left.created_at !== right.created_at) return false
  }
  return true
}

/** Latest event log from the live snapshot, shared with the sideline stats panel. */
export function readLiveMatchEvents(matchId: string): DbMatchEvent[] | null {
  if (cachedMatchId !== matchId) return null
  return cachedEvents
}

export function publishLiveMatchEvents(matchId: string, events: DbMatchEvent[]) {
  if (cachedMatchId === matchId && sameEventList(cachedEvents, events)) return
  cachedMatchId = matchId
  cachedEvents = events
  for (const listener of listeners) listener(matchId, events)
}

export function subscribeLiveMatchEvents(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
