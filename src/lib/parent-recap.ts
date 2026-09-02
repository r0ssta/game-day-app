import {
  aggregatePlayerRecaps,
} from '@/lib/match-recap'
import { formatPlayerFullName } from '@/lib/player-names'
import type { DbMatchEvent } from '@/types/database'
import type { MatchPlayer } from '@/types/match'

/**
 * Parent-safe player minutes/positions for weekly recap emails.
 * Intentionally omits plus/minus, impact ratings, and developmental review notes.
 */
export type ParentRecapPlayerLine = {
  playerId: string
  name: string
  totalSeconds: number
  totalMinutes: number
  positions: string[]
  positionsLabel: string
  bullet: string
}

export type ParentRecapEmailDraft = {
  subject: string
  body: string
  playerLines: ParentRecapPlayerLine[]
}

export type BuildParentRecapEmailInput = {
  teamName: string
  opponent: string
  matchDateLabel: string
  parentFacingRecap: string
  focusForNextWeek: string
  playerLines: ParentRecapPlayerLine[]
  /** Omit when empty — section is skipped in the email body. */
  disciplineLines?: string[]
}

/**
 * Aggregate minutes + positions for every player who logged time.
 * Does not read match_stats.plus_minus or match_reviews (impact / notes).
 */
export function aggregateParentRecapPlayerLines(
  events: DbMatchEvent[],
  halfLengthSeconds: number,
  players: Array<
    Pick<MatchPlayer, 'id' | 'firstName' | 'lastName' | 'matchPosition'> & {
      attending?: boolean
    }
  >,
): ParentRecapPlayerLine[] {
  const playersById = new Map(
    players.map((player) => [player.id, player] as const),
  )
  const eventStats = aggregatePlayerRecaps(
    events,
    halfLengthSeconds,
    new Map(
      players
        .filter((player) => player.attending !== false)
        .map((player) => [player.id, { matchPosition: player.matchPosition }]),
    ),
  )

  const lines: ParentRecapPlayerLine[] = []

  for (const [playerId, stats] of eventStats) {
    if (stats.totalSeconds <= 0) continue

    const player = playersById.get(playerId)
    const name = player
      ? formatPlayerFullName(player.firstName, player.lastName)
      : 'Player'
    const positions = stats.positions.filter((position) => position && position !== '—')
    const totalMinutes = Math.max(1, Math.round(stats.totalSeconds / 60))
    const positionsLabel = positions.length > 0 ? positions.join(', ') : '—'

    lines.push({
      playerId,
      name,
      totalSeconds: stats.totalSeconds,
      totalMinutes,
      positions,
      positionsLabel,
      bullet: `${name}: ${totalMinutes} mins (${positionsLabel})`,
    })
  }

  return lines.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

export function buildParentRecapEmailDraft(
  input: BuildParentRecapEmailInput,
): ParentRecapEmailDraft {
  const gameSummary = input.parentFacingRecap.trim() || '(Add a game summary above.)'
  const focus = input.focusForNextWeek.trim() || '(Add a focus for next week above.)'
  const playerBlock =
    input.playerLines.length > 0
      ? input.playerLines.map((line) => `• ${line.bullet}`).join('\n')
      : '• No player minutes recorded for this match.'
  const discipline = (input.disciplineLines ?? []).filter((line) => line.trim().length > 0)

  const subject = `${input.teamName} Match Recap vs. ${input.opponent} - ${input.matchDateLabel}`
  const bodyParts = [
    'Game Summary',
    gameSummary,
    '',
    'Player Minutes & Positions',
    playerBlock,
  ]
  if (discipline.length > 0) {
    bodyParts.push('', 'Discipline / Cards', ...discipline.map((line) => `• ${line}`))
  }
  bodyParts.push('', 'Focus for Next Week', focus)

  return { subject, body: bodyParts.join('\n'), playerLines: input.playerLines }
}

/**
 * True when a client-side OpenAI key is configured for parent-recap drafting.
 * Do not set VITE_OPENAI_API_KEY — that prefixes a secret into the browser bundle.
 */
export function isParentRecapAiDraftEnabled(): boolean {
  const key = import.meta.env.VITE_OPENAI_API_KEY
  return typeof key === 'string' && key.trim().length > 0
}

/**
 * Draft a balanced parent-facing summary from internal coach notes.
 * Neutralizes harsh individual critique; never invents plus/minus or ratings.
 */
export async function draftParentFacingRecapWithAi(
  internalCoachNotes: string,
  context: { teamName: string; opponent: string; scoreLine: string },
): Promise<string> {
  const apiKey = String(import.meta.env.VITE_OPENAI_API_KEY ?? '').trim()
  if (!apiKey) {
    throw new Error('AI drafting is not configured')
  }

  const notes = internalCoachNotes.trim()
  if (!notes) {
    throw new Error('Add internal coach notes first so AI has something to draft from')
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            'You write short parent-friendly youth soccer match recaps for a club email. ' +
            'Be warm, constructive, and team-focused. Never name individual players for criticism. ' +
            'Never mention plus/minus, ratings, grades, or developmental tags. ' +
            'Neutralize harsh or overly critical feedback into general team themes. ' +
            'Keep it to 2–4 short paragraphs. Plain text only.',
        },
        {
          role: 'user',
          content: [
            `Team: ${context.teamName}`,
            `Opponent: ${context.opponent}`,
            `Score: ${context.scoreLine}`,
            '',
            'Internal coach notes (staff only — rewrite for parents):',
            notes,
          ].join('\n'),
        },
      ],
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail || `AI draft failed (${response.status})`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const draft = payload.choices?.[0]?.message?.content?.trim()
  if (!draft) throw new Error('AI returned an empty draft')
  return draft
}
