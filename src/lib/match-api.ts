import { supabase } from '@/supabaseClient'
import type {
  EndRegulationInput,
  FinalizePkInput,
  FinalizeReviewInput,
  LogCardInput,
  LogFormationInput,
  LogGoalInput,
  LogPeriodInput,
  LogPkAttemptInput,
  LogSubstitutionInput,
  LogTeamEventInput,
  RemoveLastGoalInput,
  MatchActionResult,
} from '@/schemas/match-actions'

async function accessToken(): Promise<string> {
  // Prefer validated user + refreshed session so we don't send a stale JWT.
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!userData.user) throw new Error('Not signed in')

  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw new Error('Not signed in')
  return token
}

async function postMatchAction<T extends Record<string, unknown>>(
  path: string,
  body: unknown,
): Promise<MatchActionResult<T>> {
  const token = await accessToken()
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  let payload: MatchActionResult<T> | null = null
  try {
    payload = (await response.json()) as MatchActionResult<T>
  } catch {
    payload = null
  }

  if (!response.ok) {
    const code =
      payload && 'code' in payload && typeof payload.code === 'string'
        ? payload.code
        : undefined
    return {
      ok: false,
      error:
        payload && 'error' in payload && payload.error
          ? String(payload.error)
          : `Request failed (${response.status})`,
      code,
    }
  }

  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Empty response from match API' }
  }

  return payload
}

export async function apiLogTeamEvent(
  input: LogTeamEventInput,
): Promise<MatchActionResult<{ eventType: string; pairedShot: boolean }>> {
  return postMatchAction('/api/match/log-team-event', input)
}

export async function apiLogGoal(
  input: LogGoalInput,
): Promise<MatchActionResult<{ homeScore: number; awayScore: number; eventType: string }>> {
  return postMatchAction('/api/match/log-goal', input)
}

export async function apiLogCard(
  input: LogCardInput,
): Promise<MatchActionResult<{ isSecondYellow: boolean; issueRed: boolean }>> {
  return postMatchAction('/api/match/log-card', input)
}

export async function apiLogFormation(
  input: LogFormationInput,
): Promise<MatchActionResult<{ kind: LogFormationInput['kind'] }>> {
  return postMatchAction('/api/match/log-formation', input)
}

export async function apiLogSubstitution(
  input: LogSubstitutionInput,
): Promise<MatchActionResult<{ kind: LogSubstitutionInput['kind'] }>> {
  return postMatchAction('/api/match/log-substitution', input)
}

export async function apiLogPeriod(
  input: LogPeriodInput,
): Promise<MatchActionResult<{ kind: LogPeriodInput['kind']; period: number }>> {
  return postMatchAction('/api/match/log-period', input)
}

export async function apiLogPkAttempt(
  input: LogPkAttemptInput,
): Promise<MatchActionResult<{ homePkScore: number; awayPkScore: number }>> {
  return postMatchAction('/api/match/log-pk-attempt', input)
}

export async function apiEndRegulation(
  input: EndRegulationInput,
): Promise<
  MatchActionResult<{ status: string; enterPenaltyShootout: boolean }>
> {
  return postMatchAction('/api/match/end-regulation', input)
}

export async function apiFinalizePk(
  input: FinalizePkInput,
): Promise<MatchActionResult<{ status: string; pkWinnerIsUs: boolean }>> {
  return postMatchAction('/api/match/finalize-pk', input)
}

export async function apiFinalizeReview(
  input: FinalizeReviewInput,
): Promise<MatchActionResult<{ status: string }>> {
  return postMatchAction('/api/match/finalize-review', input)
}

export async function apiRemoveLastGoal(
  input: RemoveLastGoalInput,
): Promise<
  MatchActionResult<{
    homeScore: number
    awayScore: number
    removedPairedShot: boolean
    eventType: string
  }>
> {
  return postMatchAction('/api/match/remove-last-goal', input)
}
