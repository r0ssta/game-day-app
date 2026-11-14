import type { PlayerSafety } from '@/lib/player-safety'
import { hasSafetyDetails } from '@/lib/player-safety'

export function PlayerSafetyCard({ safety }: { safety: PlayerSafety }) {
  if (!hasSafetyDetails(safety)) return null
  return (
    <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-3 text-sm">
      <p className="text-[10px] font-bold uppercase tracking-widest text-danger">Safety card</p>
      {safety.allergies.trim() ? (
        <p className="mt-1 font-semibold text-foreground">Allergies: {safety.allergies.trim()}</p>
      ) : null}
      {safety.medicalNotes.trim() ? (
        <p className="mt-1 text-foreground">{safety.medicalNotes.trim()}</p>
      ) : null}
      {safety.emergencyContactName.trim() || safety.emergencyContactPhone.trim() ? (
        <p className="mt-1 font-semibold text-foreground">
          Emergency: {[safety.emergencyContactName.trim(), safety.emergencyContactPhone.trim()].filter(Boolean).join(' · ')}
        </p>
      ) : null}
      {safety.unavailableUntil ? (
        <p className="mt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Available again {safety.unavailableUntil}
        </p>
      ) : null}
    </div>
  )
}

export function PlayerSafetyFields({
  safety,
  onChange,
}: {
  safety: PlayerSafety
  onChange: (next: PlayerSafety) => void
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-background p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Sideline safety · coaches only
      </p>
      <input
        type="text"
        value={safety.emergencyContactName}
        onChange={(event) => onChange({ ...safety, emergencyContactName: event.target.value })}
        placeholder="Emergency contact name"
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold"
      />
      <input
        type="tel"
        value={safety.emergencyContactPhone}
        onChange={(event) => onChange({ ...safety, emergencyContactPhone: event.target.value })}
        placeholder="Emergency phone"
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold"
      />
      <input
        type="text"
        value={safety.allergies}
        onChange={(event) => onChange({ ...safety, allergies: event.target.value })}
        placeholder="Allergies"
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold"
      />
      <textarea
        value={safety.medicalNotes}
        onChange={(event) => onChange({ ...safety, medicalNotes: event.target.value })}
        placeholder="Medications or notes for the sideline"
        rows={2}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
      />
      <label className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Unavailable until
        <input
          type="date"
          value={safety.unavailableUntil ?? ''}
          onChange={(event) =>
            onChange({ ...safety, unavailableUntil: event.target.value || null })
          }
          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground"
        />
      </label>
      <p className="text-[11px] text-muted-foreground">
        First day they can be selected. They stay off the lineup before that date.
      </p>
    </div>
  )
}
