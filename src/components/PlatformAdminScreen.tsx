import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Building2, RefreshCw, UserPlus } from 'lucide-react'
import { ScreenHeader } from '@/components/AppNavigation'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import {
  createClub,
  createStaffInvite,
  fetchClubs,
  type CreateStaffInviteResult,
} from '@/lib/supabase-api'
import type { DbClub } from '@/types/database'
import { cn } from '@/lib/utils'

type PlatformAdminScreenProps = {
  onBackToHome: () => void
  onToast: (message: string) => void
}

export function PlatformAdminScreen({ onBackToHome, onToast }: PlatformAdminScreenProps) {
  const [clubs, setClubs] = useState<DbClub[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clubName, setClubName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [inviteClubId, setInviteClubId] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)

  const loadClubs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchClubs()
      setClubs(rows)
      setInviteClubId((current) => current || rows[0]?.id || '')
    } catch (err) {
      const detail =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : err instanceof Error
            ? err.message
            : 'Failed to load clubs'
      setError(detail || 'Failed to load clubs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadClubs()
  }, [loadClubs])

  const handleCreateClub = async (event: FormEvent) => {
    event.preventDefault()
    const name = clubName.trim()
    if (!name) {
      onToast('Enter a club name')
      return
    }
    setCreateBusy(true)
    try {
      const created = await createClub({ name })
      setClubs((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setInviteClubId(created.id)
      setClubName('')
      onToast(`Created ${created.name}`)
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to create club')
    } finally {
      setCreateBusy(false)
    }
  }

  const handleInviteDirector = async (event: FormEvent) => {
    event.preventDefault()
    const email = inviteEmail.trim()
    if (!inviteClubId) {
      onToast('Select a club first')
      return
    }
    if (!email) {
      onToast('Enter an email address')
      return
    }

    setInviteBusy(true)
    try {
      const result: CreateStaffInviteResult = await createStaffInvite({
        email,
        appRole: 'director',
        teamAssignments: [],
        displayName: inviteName,
        clubId: inviteClubId,
      })
      setInviteEmail('')
      setInviteName('')
      onToast(
        result.status === 'updated_existing'
          ? `Updated ${result.email} as director and sent a login code`
          : `Invited ${result.email} as director — login code emailed`,
      )
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to invite director')
    } finally {
      setInviteBusy(false)
    }
  }

  return (
    <main className={APP_SHELL}>
      <div className={`${APP_CONTAINER} pb-10 pt-6`}>
        <ScreenHeader
          title="Platform Admin"
          subtitle="Create sandbox clubs and invite their directors — you stay in Virginia Velocity"
          onHome={onBackToHome}
        />

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 rounded-xl border-2 border-athletic/40 bg-athletic/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-foreground">
            <Building2 className="size-4 shrink-0" strokeWidth={2.5} />
            Platform admin only
          </div>
          <button
            type="button"
            onClick={() => void loadClubs()}
            disabled={loading}
            className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border-2 border-border bg-card text-foreground disabled:opacity-50"
            aria-label="Refresh clubs"
          >
            <RefreshCw className={cn('size-5', loading && 'animate-spin')} strokeWidth={2.5} />
          </button>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border-2 border-danger/50 bg-danger/10 px-3 py-2 text-sm font-bold text-danger">
            {error}
          </p>
        ) : null}

        <section className="mt-6 space-y-4 rounded-2xl border-2 border-border bg-card p-4">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
            Clubs
          </h2>
          {loading && clubs.length === 0 ? (
            <p className="text-sm font-semibold text-muted-foreground">Loading clubs…</p>
          ) : clubs.length === 0 ? (
            <p className="text-sm font-semibold text-muted-foreground">No clubs yet.</p>
          ) : (
            <ul className="space-y-2">
              {clubs.map((club) => (
                <li
                  key={club.id}
                  className="rounded-xl border-2 border-border bg-background px-3 py-3"
                >
                  <p className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
                    {club.name}
                  </p>
                  <p className="text-xs font-semibold text-muted-foreground">/{club.slug}</p>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={(event) => void handleCreateClub(event)} className="space-y-3 border-t-2 border-border pt-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Create a sandbox club
            </h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={clubName}
                onChange={(event) => setClubName(event.target.value)}
                className="min-h-12 w-full flex-1 touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-semibold text-foreground"
                placeholder="Demo FC"
              />
              <button
                type="submit"
                disabled={createBusy}
                className="min-h-12 shrink-0 touch-manipulation rounded-xl border-2 border-neon bg-neon px-4 text-sm font-bold uppercase tracking-wide text-neon-foreground disabled:opacity-50 sm:min-w-[10rem]"
              >
                {createBusy ? 'Creating…' : 'Create Club'}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-6 space-y-4 rounded-2xl border-2 border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <UserPlus className="size-5 text-athletic" strokeWidth={2.5} />
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              Invite a club director
            </h2>
          </div>
          <p className="text-xs font-semibold text-muted-foreground">
            They get Club Admin for that club only — not Virginia Velocity teams, players, or seasons.
          </p>
          <form onSubmit={(event) => void handleInviteDirector(event)} className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Club
              </span>
              <select
                value={inviteClubId}
                onChange={(event) => setInviteClubId(event.target.value)}
                className="min-h-12 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-bold text-foreground"
              >
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.name}
                  </option>
                ))}
              </select>
            </label>
            <input
              type="text"
              value={inviteName}
              onChange={(event) => setInviteName(event.target.value)}
              className="min-h-12 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-semibold text-foreground"
              placeholder="Display name (optional)"
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                className="min-h-12 w-full flex-1 touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-semibold text-foreground"
                placeholder="coach@example.com"
              />
              <button
                type="submit"
                disabled={inviteBusy || !inviteClubId}
                className="min-h-12 shrink-0 touch-manipulation rounded-xl border-2 border-neon bg-neon px-4 text-sm font-bold uppercase tracking-wide text-neon-foreground disabled:opacity-50 sm:min-w-[10rem]"
              >
                {inviteBusy ? 'Inviting…' : 'Invite Director'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  )
}
