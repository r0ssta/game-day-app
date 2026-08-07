import { getFormationLabel } from '@/lib/formations'
import { buildAbsoluteMatchTimeline } from '@/lib/match-recap'
import { formatPlayerFullName } from '@/lib/player-names'
import type { DbMatchEvent } from '@/types/database'
import type { Impact, RosterPlayer } from '@/types/match'

export type PairCombinationStats = {
  playerAId: string
  playerBId: string
  nameA: string
  nameB: string
  jerseyA: number | null
  jerseyB: number | null
  goalsFor: number
  goalsAgainst: number
  goalDifferential: number
  goalEventsTogether: number
}

export type FormationEfficiencyStats = {
  formationId: string
  label: string
  goalsFor: number
  goalsAgainst: number
  goalDifferential: number
  goalEvents: number
}

export type PositionEfficiencyStats = {
  position: string
  plusMinus: number
  positivePercent: number
  players: number
  goals: number
  assists: number
}

export type LineupCombinationAnalytics = {
  topPairs: PairCombinationStats[]
  topFormations: FormationEfficiencyStats[]
  positionEfficiency: PositionEfficiencyStats[]
}

function pairKey(playerAId: string, playerBId: string): string {
  return [playerAId, playerBId].sort().join('::')
}

function iterPairs(playerIds: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      pairs.push([playerIds[i], playerIds[j]])
    }
  }
  return pairs
}

type MutablePairStats = {
  playerAId: string
  playerBId: string
  goalsFor: number
  goalsAgainst: number
  goalEventsTogether: number
}

type MutableFormationStats = {
  formationId: string
  goalsFor: number
  goalsAgainst: number
  goalEvents: number
}

export function computeLineupCombinationAnalytics(
  events: DbMatchEvent[],
  halfLengthSeconds: number,
  roster: RosterPlayer[],
  options?: {
    firstHalfStarterIds?: Iterable<string>
    playerPlusMinusByPosition?: Map<string, { position: string; plusMinus: number; impact: Impact }[]>
  },
): LineupCombinationAnalytics {
  const rosterById = new Map(roster.map((player) => [player.id, player]))
  const timeline = buildAbsoluteMatchTimeline(events, halfLengthSeconds)
  const onField = new Set<string>()
  const pairStats = new Map<string, MutablePairStats>()
  const formationStats = new Map<string, MutableFormationStats>()
  let sawSubstitution = false

  const seedStarters = () => {
    if (options?.firstHalfStarterIds) {
      for (const playerId of options.firstHalfStarterIds) {
        onField.add(playerId)
      }
    }
  }

  const applyGoalToPairsAndFormation = (
    delta: 1 | -1,
    formationId: string | null | undefined,
  ) => {
    if (onField.size === 0 && !sawSubstitution) seedStarters()

    const onFieldIds = [...onField]
    for (const [playerAId, playerBId] of iterPairs(onFieldIds)) {
      const key = pairKey(playerAId, playerBId)
      const existing = pairStats.get(key) ?? {
        playerAId,
        playerBId,
        goalsFor: 0,
        goalsAgainst: 0,
        goalEventsTogether: 0,
      }
      if (delta > 0) existing.goalsFor += 1
      else existing.goalsAgainst += 1
      existing.goalEventsTogether += 1
      pairStats.set(key, existing)
    }

    if (formationId?.trim()) {
      const id = formationId.trim()
      const existing = formationStats.get(id) ?? {
        formationId: id,
        goalsFor: 0,
        goalsAgainst: 0,
        goalEvents: 0,
      }
      if (delta > 0) existing.goalsFor += 1
      else existing.goalsAgainst += 1
      existing.goalEvents += 1
      formationStats.set(id, existing)
    }
  }

  for (const event of timeline) {
    switch (event.event_type) {
      case 'sub_in':
        sawSubstitution = true
        if (event.player_id) onField.add(event.player_id)
        break
      case 'sub_out':
        sawSubstitution = true
        if (event.player_id) onField.delete(event.player_id)
        break
      case 'goal':
        applyGoalToPairsAndFormation(1, event.formation)
        break
      case 'opponent_goal':
        applyGoalToPairsAndFormation(-1, event.formation)
        break
    }
  }

  const topPairs = [...pairStats.values()]
    .map((entry) => {
      const playerA = rosterById.get(entry.playerAId)
      const playerB = rosterById.get(entry.playerBId)
      return {
        playerAId: entry.playerAId,
        playerBId: entry.playerBId,
        nameA: playerA
          ? formatPlayerFullName(playerA.firstName, playerA.lastName)
          : 'Unknown',
        nameB: playerB
          ? formatPlayerFullName(playerB.firstName, playerB.lastName)
          : 'Unknown',
        jerseyA: playerA?.number ?? null,
        jerseyB: playerB?.number ?? null,
        goalsFor: entry.goalsFor,
        goalsAgainst: entry.goalsAgainst,
        goalDifferential: entry.goalsFor - entry.goalsAgainst,
        goalEventsTogether: entry.goalEventsTogether,
      }
    })
    .filter((entry) => entry.goalEventsTogether > 0)
    .sort(
      (a, b) =>
        b.goalDifferential - a.goalDifferential ||
        b.goalsFor - a.goalsFor ||
        a.nameA.localeCompare(b.nameA),
    )

  const topFormations = [...formationStats.values()]
    .map((entry) => ({
      formationId: entry.formationId,
      label: getFormationLabel(entry.formationId),
      goalsFor: entry.goalsFor,
      goalsAgainst: entry.goalsAgainst,
      goalDifferential: entry.goalsFor - entry.goalsAgainst,
      goalEvents: entry.goalEvents,
    }))
    .sort(
      (a, b) =>
        b.goalDifferential - a.goalDifferential ||
        b.goalsFor - a.goalsFor ||
        a.label.localeCompare(b.label),
    )

  const positionBuckets = new Map<
    string,
    { plusMinus: number; positive: number; neutral: number; negative: number; players: Set<string>; goals: number; assists: number }
  >()

  if (options?.playerPlusMinusByPosition) {
    for (const [playerId, entries] of options.playerPlusMinusByPosition) {
      for (const entry of entries) {
        const bucket = positionBuckets.get(entry.position) ?? {
          plusMinus: 0,
          positive: 0,
          neutral: 0,
          negative: 0,
          players: new Set<string>(),
          goals: 0,
          assists: 0,
        }
        bucket.plusMinus += entry.plusMinus
        bucket.players.add(playerId)
        if (entry.impact === 'positive') bucket.positive += 1
        else if (entry.impact === 'negative') bucket.negative += 1
        else bucket.neutral += 1
        positionBuckets.set(entry.position, bucket)
      }
    }
  }

  const positionEfficiency = [...positionBuckets.entries()]
    .map(([position, bucket]) => {
      const rated = bucket.positive + bucket.neutral + bucket.negative
      return {
        position,
        plusMinus: bucket.plusMinus,
        positivePercent: rated > 0 ? Math.round((bucket.positive / rated) * 100) : 0,
        players: bucket.players.size,
        goals: bucket.goals,
        assists: bucket.assists,
      }
    })
    .sort((a, b) => b.plusMinus - a.plusMinus || b.positivePercent - a.positivePercent)

  return { topPairs, topFormations, positionEfficiency }
}

export function mergeLineupCombinationAnalytics(
  chunks: LineupCombinationAnalytics[],
): LineupCombinationAnalytics {
  const pairMap = new Map<string, PairCombinationStats>()
  const formationMap = new Map<string, FormationEfficiencyStats>()
  const positionMap = new Map<string, PositionEfficiencyStats>()

  for (const chunk of chunks) {
    for (const pair of chunk.topPairs) {
      const key = pairKey(pair.playerAId, pair.playerBId)
      const existing = pairMap.get(key)
      if (existing) {
        existing.goalsFor += pair.goalsFor
        existing.goalsAgainst += pair.goalsAgainst
        existing.goalDifferential = existing.goalsFor - existing.goalsAgainst
        existing.goalEventsTogether += pair.goalEventsTogether
      } else {
        pairMap.set(key, { ...pair })
      }
    }

    for (const formation of chunk.topFormations) {
      const existing = formationMap.get(formation.formationId)
      if (existing) {
        existing.goalsFor += formation.goalsFor
        existing.goalsAgainst += formation.goalsAgainst
        existing.goalDifferential = existing.goalsFor - existing.goalsAgainst
        existing.goalEvents += formation.goalEvents
      } else {
        formationMap.set(formation.formationId, { ...formation })
      }
    }

    for (const position of chunk.positionEfficiency) {
      const existing = positionMap.get(position.position)
      if (existing) {
        existing.plusMinus += position.plusMinus
        existing.players += position.players
        existing.goals += position.goals
        existing.assists += position.assists
        existing.positivePercent = Math.round(
          (existing.positivePercent + position.positivePercent) / 2,
        )
      } else {
        positionMap.set(position.position, { ...position })
      }
    }
  }

  return {
    topPairs: [...pairMap.values()]
      .sort((a, b) => b.goalDifferential - a.goalDifferential)
      .slice(0, 8),
    topFormations: [...formationMap.values()].sort(
      (a, b) => b.goalDifferential - a.goalDifferential,
    ),
    positionEfficiency: [...positionMap.values()].sort((a, b) => b.plusMinus - a.plusMinus),
  }
}
