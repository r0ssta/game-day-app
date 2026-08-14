import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Shield } from 'lucide-react'
import { ScreenHeader } from '@/components/AppNavigation'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import {
  ASSIGNABLE_STAFF_ROLES,
  type AssignableStaffRole,
  formatStaffRoleLabel,
  isAssignableStaffRole,
} from '@/lib/staff-roles'
import {
  fetchClubAdminUsers,
  replaceClubUserTeams,
  revokeClubUserAccess,
  updateClubUserRole,
  type ClubAdminUserRow,
} from '@/lib/supabase-api'
import { cn } from '@/lib/utils'

type ClubAdminScreenProps = {
  teams: Array<{ id: string; name: string }>
  currentUserId: string | null
  onBackToHome: () => void
  onToast: (message: string) => void
}

export function ClubAdminScreen({
  teams,
  currentUserId,
  onBackToHome,
  onToast,
}: ClubAdminScreenProps) {
  const [users, setUsers] = useState<ClubAdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [draftTeams, setDraftTeams] = useState<Record<string, string[]>>({})

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchClubAdminUsers()
      setUsers(rows)
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

  return (
    <main className={APP_SHELL}>
      <div className={`${APP_CONTAINER} pb-10 pt-6`}>
        <ScreenHeader
          title="Club Admin"
          subtitle="Assign staff roles and team access"
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

        {loading && users.length === 0 ? (
          <p className="mt-6 text-sm font-semibold text-muted-foreground">Loading staff…</p>
        ) : users.length === 0 ? (
          <p className="mt-6 text-sm font-semibold text-muted-foreground">
            No registered users yet. Ask coaches to request a magic link from the login screen.
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
                          value={
                            user.role === 'pending' ? '' : user.role
                          }
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
