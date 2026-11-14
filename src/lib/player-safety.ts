/** Coach-only sideline card. `unavailableUntil` is the first day they can be selected. */
export type PlayerSafety = {
  emergencyContactName: string
  emergencyContactPhone: string
  allergies: string
  medicalNotes: string
  unavailableUntil: string | null
}

export function emptyPlayerSafety(): PlayerSafety {
  return {
    emergencyContactName: '',
    emergencyContactPhone: '',
    allergies: '',
    medicalNotes: '',
    unavailableUntil: null,
  }
}

export function hasSafetyDetails(safety: PlayerSafety | null | undefined): boolean {
  if (!safety) return false
  return Boolean(
    safety.emergencyContactName.trim() ||
      safety.emergencyContactPhone.trim() ||
      safety.allergies.trim() ||
      safety.medicalNotes.trim() ||
      safety.unavailableUntil,
  )
}

/** True when the match date is before the first day they can be selected. */
export function isUnavailableOn(
  unavailableUntil: string | null | undefined,
  matchDate: string | null | undefined,
): boolean {
  const until = unavailableUntil?.slice(0, 10)
  const day = matchDate?.slice(0, 10)
  if (!until || !day) return false
  return day < until
}
