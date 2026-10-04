import type { GoalWizardStep, GoalWizardTeam } from '@/components/GoalWizardModal'
import type { ShotType } from '@/schemas/match-actions'

export type GoalWizardCloseCommit =
  | {
      kind: 'our'
      scorerId: string | null
      assistPlayerId: string | null
      shotType: ShotType | null
      fromCorner: boolean | null
    }
  | {
      kind: 'opponent'
      fromCorner: boolean | null
    }

/**
 * Closing the goal sheet always records the goal. Tagging is optional;
 * Undo is how a coach drops a tap they did not mean.
 */
export function goalWizardCloseCommit(input: {
  team: GoalWizardTeam
  step: GoalWizardStep
  shotType: ShotType | null
  scorerId: string | null
  fromCorner: boolean | null
}): GoalWizardCloseCommit {
  const fromCorner = input.step === 'corner' ? null : input.fromCorner

  if (input.team === 'opponent') {
    return { kind: 'opponent', fromCorner }
  }

  if (input.step === 'assist' && input.scorerId) {
    return {
      kind: 'our',
      scorerId: input.scorerId,
      assistPlayerId: null,
      shotType: input.shotType,
      fromCorner,
    }
  }

  if (input.step === 'scorer') {
    return {
      kind: 'our',
      scorerId: null,
      assistPlayerId: null,
      shotType: input.shotType,
      fromCorner,
    }
  }

  return {
    kind: 'our',
    scorerId: null,
    assistPlayerId: null,
    shotType: null,
    fromCorner,
  }
}
