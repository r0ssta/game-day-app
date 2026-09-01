import { describe, expect, it } from 'vitest'
import { AGE_GROUPS, formatForAgeGroup, type AgeGroup } from './age-groups'
import { getDefaultFormationId, getFormationById } from './formations'
import { getMaxFieldPlayers } from './lineup'
import type { TeamFormat } from './team-format'

const FORMAT_BY_AGE_GROUP: Record<AgeGroup, TeamFormat> = {
  U9: '7v7',
  U10: '7v7',
  U11: '9v9',
  U12: '9v9',
  U13: '11v11',
  U14: '11v11',
  U15: '11v11',
  U16: '11v11',
}

describe('formatForAgeGroup', () => {
  it.each(AGE_GROUPS)('%s uses the club format for that age', (ageGroup) => {
    expect(formatForAgeGroup(ageGroup)).toBe(FORMAT_BY_AGE_GROUP[ageGroup])
  })

  it('maps U9 and U10 to 7v7, U11 and U12 to 9v9, and U13+ to 11v11', () => {
    expect(formatForAgeGroup('U9')).toBe('7v7')
    expect(formatForAgeGroup('U10')).toBe('7v7')
    expect(formatForAgeGroup('U11')).toBe('9v9')
    expect(formatForAgeGroup('U12')).toBe('9v9')
    expect(formatForAgeGroup('U13')).toBe('11v11')
    expect(formatForAgeGroup('U14')).toBe('11v11')
    expect(formatForAgeGroup('U15')).toBe('11v11')
    expect(formatForAgeGroup('U16')).toBe('11v11')
  })

  it('gives every age group a default formation whose slot count matches the format', () => {
    for (const ageGroup of AGE_GROUPS) {
      const format = formatForAgeGroup(ageGroup)
      const maxOnField = getMaxFieldPlayers(format)
      const formation = getFormationById(getDefaultFormationId(format), format)
      expect(formation.format).toBe(format)
      expect(formation.slots).toHaveLength(maxOnField)
    }
  })
})
