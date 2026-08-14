import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { RefreshCw, Shield, UserPlus, Users } from 'lucide-react'
import { ScreenHeader } from '@/components/AppNavigation'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import {
  ASSIGNABLE_STAFF_ROLES,
  type AssignableStaffRole,
  formatStaffRoleLabel,
  isAssignableStaffRole,
} from '@/lib/staff-roles'
import {
  AGE_GROUPS,
  type AgeGroup,
  ageGroupFormatHint,
  defaultTeamNameForAgeGroup,
  isAgeGroup,
} from '@/lib/age-groups'
import { CLUB_NAME } from '@/lib/branding'
import {
  cancelStaffInvite,
  createStaffInvite,
  fetchClubAdminUsers,
  fetchPendingStaffInvites,
  replaceClubUserTeams,
  revokeClubUserAccess,
  updateClubUserRole,
  type ClubAdminUserRow,
  type StaffInviteRow,
} from '@/lib/supabase-api'
import { cn } from '@/lib/utils'

type ClubAdminScreenProps = {
  teams: Array<{ id: string; name: string }>
  currentUserId: string | null
  onCreateTeam: (input: { name?: string; ageGroup: AgeGroup }) => Promise<string | void>
  onBackToHome: () => void
  onToast: (message: string) => void
}

export function ClubAdminScreen({
  teams,
  currentUserId,
  onCreateTeam,
  onBackToHome,
  onToast,
}: ClubAdminScreenProps) {
  const [users, setUsers] = useState<ClubAdminUserRow[]>([])
  const [invites, setInvites] = useState<StaffInviteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [draftTeams, setDraftTeams] = useState<Record<string, string[]>>({})

  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamAgeGroup, setNewTeamAgeGroup] = useState<AgeGroup>('U13')
  const [createTeamBusy, setCreateTeamBusy] = useState(false)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<AssignableStaffRole>('assistant_coach')
  const [inviteTeamIds, setInviteTeamIds] = useState<string[]>([])
  const [inviteBusy, setInviteBusy] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rows, pendingInvites] = await Promise.all([
        fetchClubAdminUsers(),
        fetchPendingStaffInvites(),
      ])
      setUsers(rows)
      setInvites(pendingInvites)
      setDraftTeams(
        Object.fromEntries(rows.map((row) => [row.id, [...row.teamIds]])),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load club users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const handleCreateTeam = async (event: FormEvent) => {
    event.preventDefault()
    setCreateTeamBusy(true)
    try {
      const name = newTeamName.trim() || defaultTeamNameForAgeGroup(newTeamAgeGroup, CLUB_NAME)
      await onCreateTeam({ name, ageGroup: newTeamAgeGroup })
      setNewTeamName('')
      onToast(`Created ${name} (${ageGroupFormatHint(newTeamAgeGroup)})`)
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to create team')
    } finally {
      setCreateTeamBusy(false)
    }
  }

  const handleCreateInvite = async (event: FormEvent) => {
    event.preventDefault()
    const email = inviteEmail.trim()
    if (!email) {
      onToast('Enter an email address')
      return
    }

    setInviteBusy(true)
    try {
      const result = await createStaffInvite({
        email,
        role: inviteRole,
        teamIds: inviteTeamIds,
        displayName: inviteName,
      })
      setInviteEmail('')
      setInviteName('')
      setInviteRole('assistant_coach')
      setInviteTeamIds([])
      await loadUsers()
      onToast(
        result.status === 'updated_existing'
          ? `Updated ${result.email} and sent a login link`
          : `Invite sent to ${result.email}`,
      )
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to create invite')
    } finally {
      setInviteBusy(false)
    }
  }

  const toggleInviteTeam = (teamId: string) => {
    setInviteTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId],
    )
  }

  const handleRoleChange = async (userId: string, nextRole: AssignableStaffRole) => {
    setBusyUserId(userId)
    try {
      await updateClubUserRole(userId, nextRole)
      setUsers((prev) =>
        prev.map((row) => (row.id === userId ? { ...row, role: nextRole } : row)),
      )
      onToast(`Updated role to ${formatStaffRoleLabel(nextRole)}`)
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setBusyUserId(null)
    }
  }

  const toggleTeam = (userId: string, teamId: string) => {
    setDraftTeams((prev) => {
      const current = prev[userId] ?? []
      const next = current.includes(teamId)
        ? current.filter((id) => id !== teamId)
        : [...current, teamId]
      return { ...prev, [userId]: next }
    })
  }

  const handleSaveTeams = async (user: ClubAdminUserRow) => {
    const nextTeamIds = draftTeams[user.id] ?? []
    setBusyUserId(user.id)
    try {
      const membershipRole: AssignableStaffRole =
        user.role === 'pending'
          ? 'assistant_coach'
          : isAssignableStaffRole(user.role)
            ? user.role
            : 'assistant_coach'
      await replaceClubUserTeams(user.id, nextTeamIds, membershipRole)
      setUsers((prev) =>
        prev.map((row) =>
          row.id === user.id ? { ...row, teamIds: [...nextTeamIds] } : row,
        ),
      )
      onToast('Team assignments saved')
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to save teams')
    } finally {
      setBusyUserId(null)
    }
  }

  const handleRevoke = async (user: ClubAdminUserRow) => {
    if (user.id === currentUserId) {
      onToast('You cannot revoke your own access')
      return
    }
    const confirmed = window.confirm(
      `Revoke access for ${user.email ?? user.displayName ?? 'this user'}? They will become Pending and lose all team assignments.`,
    )
    if (!confirmed) return

    setBusyUserId(user.id)
    try {
      await revokeClubUserAccess(user.id)
      setUsers((prev) =>
        prev.map((row) =>
          row.id === user.id ? { ...row, role: 'pending', teamIds: [] } : row,
        ),
      )
      setDraftTeams((prev) => ({ ...prev, [user.id]: [] }))
      onToast('Access revoked')
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to revoke access')
    } finally {
      setBusyUserId(null)
    }
  }

  const handleCancelInvite = async (invite: StaffInviteRow) => {
    setBusyUserId(invite.id)
    try {
      await cancelStaffInvite(invite.id)
      setInvites((prev) => prev.filter((row) => row.id !== invite.id))
      onToast(`Cancelled invite for ${invite.email}`)
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to cancel invite')
    } finally {
      setBusyUserId(null)
    }
  }

  return (
    <main className={APP_SHELL}>
      <div className={`${APP_CONTAINER} pb-10 pt-6`}>
        <ScreenHeader
          title="Club Admin"
          subtitle="Create teams, invite staff, and assign access"
          onHome={onBackToHome}
        />

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 rounded-xl border-2 border-athletic/40 bg-athletic/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-foreground">
            <Shield className="size-4 shrink-0" strokeWidth={2.5} />
            Director only — manage club staff
          </div>
          <button
            type="button"
            onClick={() => void loadUsers()}
            disabled={loading}
            className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border-2 border-border bg-card text-foreground disabled:opacity-50"
            aria-label="Refresh users"
          >
            <RefreshCw className={cn('size-5', loading && 'animate-spin')} strokeWidth={2.5} />
          </button>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border-2 border-danger/50 bg-danger/10 px-3 py-2 text-sm font-bold text-danger">
            {error}
          </p>
        ) : null}

        <form
          onSubmit={(event) => void handleCreateTeam(event)}
          className="club-admin-invite mt-6 space-y-3 rounded-2xl border-2 border-border bg-card p-4"
        >
          <div className="flex items-center gap-2">
            <Users className="size-5 text-athletic" strokeWidth={2.5} />
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              Create a Team
            </h2>
          </div>
          <p className="text-xs font-semibold text-muted-foreground">
            Age group sets the default lineup format (U13–U16 = 11v11, U11–U12 = 9v9, U9–U10 = 7v7).
          </p>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Age group
            </span>
            <select
              value={newTeamAgeGroup}
              onChange={(event) => {
                if (isAgeGroup(event.target.value)) setNewTeamAgeGroup(event.target.value)
              }}
              className="min-h-12 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-bold text-foreground"
            >
              {AGE_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {ageGroupFormatHint(group)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={newTeamName}
              onChange={(event) => setNewTeamName(event.target.value)}
              className="min-h-12 w-full flex-1 touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-semibold text-foreground"
              placeholder={`Optional name (default: ${defaultTeamNameForAgeGroup(newTeamAgeGroup, CLUB_NAME)})`}
            />
            <button
              type="submit"
              disabled={createTeamBusy}
              className="min-h-12 shrink-0 touch-manipulation rounded-xl border-2 border-neon bg-neon px-4 text-sm font-bold uppercase tracking-wide text-neon-foreground disabled:opacity-50 sm:min-w-[10rem]"
            >
              {createTeamBusy ? 'Creating…' : 'Create Team'}
            </button>
          </div>
          {teams.length > 0 ? (
            <p className="text-xs font-semibold text-muted-foreground">
              {teams.length} team{teams.length === 1 ? '' : 's'} in the club
              {teams.length <= 8 ? `: ${teams.map((team) => team.name).join(', ')}` : ''}
            </p>
          ) : null}
        </form>

        <form
          onSubmit={(event) => void handleCreateInvite(event)}
          className="club-admin-invite mt-6 space-y-4 rounded-2xl border-2 border-border bg-card p-4"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="size-5 text-athletic" strokeWidth={2.5} />
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              Create Staff Account
            </h2>
          </div>
          <p className="text-xs font-semibold text-muted-foreground">
            We email them a magic link. When they open it, their role and team access are applied
            automatically.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Email
              </span>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                className="min-h-11 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-semibold text-foreground"
                placeholder="coach@club.com"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Display name
              </span>
              <input
                type="text"
                value={inviteName}
                onChange={(event) => setInviteName(event.target.value)}
                className="min-h-11 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-semibold text-foreground"
                placeholder="Optional"
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Role
            </span>
            <select
              value={inviteRole}
              onChange={(event) => {
                const value = event.target.value
                if (isAssignableStaffRole(value)) setInviteRole(value)
              }}
              className="min-h-11 w-full max-w-xs touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-bold text-foreground"
            >
              {ASSIGNABLE_STAFF_ROLES.map((role) => (
                <option key={role} value={role}>
                  {formatStaffRoleLabel(role)}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Assign teams
            </span>
            {teams.length === 0 ? (
              <p className="text-xs font-semibold text-muted-foreground">
                Create teams on Home first, then assign them here.
              </p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {teams.map((team) => {
                  const checked = inviteTeamIds.includes(team.id)
                  return (
                    <label
                      key={team.id}
                      className={cn(
                        'flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border-2 px-2 py-1.5 text-xs font-bold',
                        checked
                          ? 'border-athletic bg-athletic/10 text-foreground'
                          : 'border-border bg-background text-muted-foreground',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-athletic"
                        checked={checked}
                        onChange={() => toggleInviteTeam(team.id)}
                      />
                      {team.name}
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={inviteBusy}
            className="flex min-h-12 w-full touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-neon bg-neon px-4 text-sm font-bold uppercase tracking-wide text-neon-foreground disabled:opacity-50"
          >
            <UserPlus className="size-4" strokeWidth={2.5} />
            {inviteBusy ? 'Sending invite…' : 'Create Account & Email Invite'}
          </button>
        </form>

        {invites.length > 0 ? (
          <section className="mt-6 space-y-3">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              Pending Invites
            </h2>
            <div className="space-y-2">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex flex-col gap-2 rounded-xl border-2 border-border bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-black text-foreground">
                      {invite.displayName?.trim() || invite.email}
                    </p>
                    <p className="text-xs font-semibold text-muted-foreground">
                      {invite.email} · {formatStaffRoleLabel(invite.role)} ·{' '}
                      {invite.teamIds.length} team{invite.teamIds.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyUserId === invite.id}
                    onClick={() => void handleCancelInvite(invite)}
                    className="min-h-10 touch-manipulation rounded-xl border-2 border-border bg-secondary px-3 text-[11px] font-bold uppercase tracking-wide text-foreground disabled:opacity-40"
                  >
                    Cancel Invite
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {loading && users.length === 0 ? (
          <p className="mt-6 text-sm font-semibold text-muted-foreground">Loading staff…</p>
        ) : users.length === 0 ? (
          <p className="mt-6 text-sm font-semibold text-muted-foreground">
            No registered users yet. Create a staff account above to get started.
          </p>
        ) : (
          <div className="club-admin-table mt-6 overflow-x-auto rounded-2xl border-2 border-border bg-card">
            <table className="w-full min-w-[42rem] border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-border bg-secondary/40">
                  <th className="px-3 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    User
                  </th>
                  <th className="px-3 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Role
                  </th>
                  <th className="px-3 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Teams
                  </th>
                  <th className="px-3 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const selectedTeams = draftTeams[user.id] ?? []
                  const busy = busyUserId === user.id
                  const teamsDirty =
                    [...selectedTeams].sort().join(',') !==
                    [...user.teamIds].sort().join(',')

                  return (
                    <tr key={user.id} className="border-b border-border align-top last:border-b-0">
                      <td className="px-3 py-3">
                        <p className="text-sm font-black text-foreground">
                          {user.displayName?.trim() || '—'}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                          {user.email ?? user.id}
                        </p>
                        {user.id === currentUserId ? (
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-athletic">
                            You
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={user.role === 'pending' ? '' : user.role}
                          disabled={busy || user.id === currentUserId}
                          onChange={(event) => {
                            const value = event.target.value
                            if (!isAssignableStaffRole(value)) return
                            void handleRoleChange(user.id, value)
                          }}
                          className="min-h-11 w-full max-w-[11rem] touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-bold text-foreground"
                        >
                          <option value="" disabled>
                            Pending
                          </option>
                          {ASSIGNABLE_STAFF_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {formatStaffRoleLabel(role)}
                            </option>
                          ))}
                        </select>
                        {user.role === 'pending' ? (
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-danger">
                            Awaiting assignment
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        {teams.length === 0 ? (
                          <p className="text-xs font-semibold text-muted-foreground">
                            Create teams on Home first.
                          </p>
                        ) : (
                          <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-1">
                            {teams.map((team) => {
                              const checked = selectedTeams.includes(team.id)
                              return (
                                <label
                                  key={team.id}
                                  className={cn(
                                    'flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border-2 px-2 py-1.5 text-xs font-bold',
                                    checked
                                      ? 'border-athletic bg-athletic/10 text-foreground'
                                      : 'border-border bg-background text-muted-foreground',
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    className="size-4 accent-athletic"
                                    checked={checked}
                                    disabled={busy}
                                    onChange={() => toggleTeam(user.id, team.id)}
                                  />
                                  {team.name}
                                </label>
                              )
                            })}
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={busy || !teamsDirty}
                          onClick={() => void handleSaveTeams(user)}
                          className="mt-2 min-h-10 w-full touch-manipulation rounded-xl border-2 border-border bg-secondary px-3 text-[11px] font-bold uppercase tracking-wide text-foreground disabled:opacity-40"
                        >
                          Save Teams
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          disabled={busy || user.id === currentUserId}
                          onClick={() => void handleRevoke(user)}
                          className="min-h-11 w-full touch-manipulation rounded-xl border-2 border-danger/60 bg-danger/10 px-3 text-[11px] font-bold uppercase tracking-wide text-danger disabled:opacity-40"
                        >
                          Revoke Access
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
