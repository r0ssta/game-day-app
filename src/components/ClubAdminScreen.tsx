import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Archive,
  CheckCircle2,
  ClipboardList,
  Pencil,
  RefreshCw,
  Shield,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { ScreenHeader } from '@/components/AppNavigation'
import { DeleteMatchConfirmModal } from '@/components/DeleteMatchConfirmModal'
import { SeasonManagerPanel } from '@/components/SeasonManagerPanel'
import { AgeGroupPoolPanel } from '@/components/AgeGroupPoolPanel'
import { PlayerDirectoryPanel } from '@/components/PlayerDirectoryPanel'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import {
  type AssignableAppRole,
  type ActiveAppRole,
  type TeamRole,
  ASSIGNABLE_APP_ROLES,
  TEAM_ROLES,
  formatAppRoleLabel,
  formatTeamRoleLabel,
  isActiveAppRole,
  isAssignableAppRole,
  isTeamRole,
} from '@/lib/staff-roles'
import {
  AGE_GROUPS,
  type AgeGroup,
  ageGroupFormatHint,
  defaultTeamNameForAgeGroup,
  formatForAgeGroup,
  formatTeamDisplayName,
  isAgeGroup,
  normalizeAgeGroup,
  stripAgeGroupFromTeamName,
} from '@/lib/age-groups'
import { CLUB_NAME } from '@/lib/branding'
import {
  cancelStaffInvite,
  createStaffInvite,
  fetchClubAdminUsers,
  fetchPendingStaffInvites,
  replaceClubUserTeams,
  revokeClubUserAccess,
  updateClubUserAppRole,
  type ClubAdminTeamAssignment,
  type ClubAdminUserRow,
  type StaffInviteRow,
} from '@/lib/supabase-api'
import type { DbSeason, DbTeam } from '@/types/database'
import { cn } from '@/lib/utils'

type ClubAdminTab = 'setup' | 'staff' | 'players'

const STAFF_ROSTER_ROLE_ORDER: ActiveAppRole[] = ['director', 'coach']

function staffDisplayName(user: ClubAdminUserRow): string {
  return user.displayName?.trim() || user.email?.trim() || 'Unnamed staff'
}

function compareStaffUsers(a: ClubAdminUserRow, b: ClubAdminUserRow): number {
  const roleRank =
    STAFF_ROSTER_ROLE_ORDER.indexOf(a.appRole as ActiveAppRole) -
    STAFF_ROSTER_ROLE_ORDER.indexOf(b.appRole as ActiveAppRole)
  if (roleRank !== 0) return roleRank
  return staffDisplayName(a).localeCompare(staffDisplayName(b), undefined, {
    sensitivity: 'base',
  })
}

function assignmentsEqual(
  a: ClubAdminTeamAssignment[],
  b: ClubAdminTeamAssignment[],
): boolean {
  const norm = (rows: ClubAdminTeamAssignment[]) =>
    [...rows]
      .map((r) => `${r.teamId}:${r.teamRole}`)
      .sort()
      .join('|')
  return norm(a) === norm(b)
}

function TeamRoleSelect({
  value,
  disabled,
  onChange,
}: {
  value: TeamRole
  disabled?: boolean
  onChange: (role: TeamRole) => void
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => {
        if (isTeamRole(event.target.value)) onChange(event.target.value)
      }}
      aria-label="Team coaching role"
      className="min-h-11 w-full touch-manipulation rounded-xl border-2 border-border bg-background px-2 text-xs font-bold text-foreground disabled:opacity-50"
    >
      {TEAM_ROLES.map((role) => (
        <option key={role} value={role}>
          {formatTeamRoleLabel(role)}
        </option>
      ))}
    </select>
  )
}

type ClubAdminTeam = {
  id: string
  name: string
  ageGroup?: string | null
  activeStatus?: boolean
}

type ClubAdminScreenProps = {
  teams: ClubAdminTeam[]
  /** Full team rows for development reports (includes archived). */
  reportTeams: DbTeam[]
  seasons: DbSeason[]
  activeSeasonId: string | null
  activeSeason: DbSeason | null
  currentUserId: string | null
  onCreateTeam: (input: { name?: string; ageGroup: AgeGroup }) => Promise<string | void>
  onUpdateTeam: (
    teamId: string,
    input: { name: string; ageGroup: AgeGroup },
  ) => Promise<unknown>
  onArchiveTeam: (teamId: string) => Promise<void>
  onRestoreTeam: (teamId: string) => Promise<void>
  onCreateSeason: (input: {
    name: string
    startsOn: string | null
    endsOn: string | null
  }) => Promise<unknown>
  onUpdateSeason: (
    seasonId: string,
    input: {
      name: string
      startsOn: string | null
      endsOn: string | null
    },
  ) => Promise<unknown>
  onActivateSeason: (seasonId: string) => Promise<unknown>
  onArchiveSeason: (seasonId: string) => Promise<unknown>
  onCreatePoolPlayer: (input: {
    firstName: string
    lastName: string
    jersey: number | null
    ageGroup: AgeGroup
    primaryPosition?: string
    secondaryPosition?: string
  }) => Promise<unknown>
  onAssignPoolPlayer: (input: {
    seasonId: string
    teamId: string
    playerId: string
    primaryJerseyNumber?: number | null
  }) => Promise<unknown>
  loadAgeGroupPool: (
    ageGroup: AgeGroup,
    options?: { includeInactive?: boolean },
  ) => Promise<import('@/types/database').DbPlayer[]>
  onSetPlayerActive: (playerId: string, active: boolean) => Promise<unknown>
  onBackToHome: () => void
  onToast: (message: string) => void
}

export function ClubAdminScreen({
  teams,
  reportTeams,
  seasons,
  activeSeasonId,
  activeSeason,
  currentUserId,
  onCreateTeam,
  onUpdateTeam,
  onArchiveTeam,
  onRestoreTeam,
  onCreateSeason,
  onUpdateSeason,
  onActivateSeason,
  onArchiveSeason,
  onCreatePoolPlayer,
  onAssignPoolPlayer,
  loadAgeGroupPool,
  onSetPlayerActive,
  onBackToHome,
  onToast,
}: ClubAdminScreenProps) {
  const [users, setUsers] = useState<ClubAdminUserRow[]>([])
  const [invites, setInvites] = useState<StaffInviteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [draftAssignments, setDraftAssignments] = useState<
    Record<string, ClubAdminTeamAssignment[]>
  >({})

  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamAgeGroup, setNewTeamAgeGroup] = useState<AgeGroup>('U13')
  const [createTeamBusy, setCreateTeamBusy] = useState(false)

  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [editTeamName, setEditTeamName] = useState('')
  const [editTeamAgeGroup, setEditTeamAgeGroup] = useState<AgeGroup>('U13')
  const [editTeamBusy, setEditTeamBusy] = useState(false)
  const [teamPendingArchive, setTeamPendingArchive] = useState<ClubAdminTeam | null>(null)
  const [archiveTeamBusy, setArchiveTeamBusy] = useState(false)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteAppRole, setInviteAppRole] = useState<AssignableAppRole>('coach')
  const [inviteAssignments, setInviteAssignments] = useState<ClubAdminTeamAssignment[]>([])
  const [inviteBusy, setInviteBusy] = useState(false)
  const [adminTab, setAdminTab] = useState<ClubAdminTab>('setup')

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
      setDraftAssignments(
        Object.fromEntries(rows.map((row) => [row.id, [...row.teamAssignments]])),
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
      onToast(`Created ${formatTeamDisplayName(name, newTeamAgeGroup)}`)
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to create team')
    } finally {
      setCreateTeamBusy(false)
    }
  }

  const beginEditTeam = (team: ClubAdminTeam) => {
    const ageGroup = normalizeAgeGroup(team.ageGroup) ?? 'U13'
    setEditingTeamId(team.id)
    setEditTeamAgeGroup(ageGroup)
    setEditTeamName(stripAgeGroupFromTeamName(team.name, ageGroup) || team.name)
  }

  const cancelEditTeam = () => {
    setEditingTeamId(null)
    setEditTeamName('')
    setEditTeamAgeGroup('U13')
  }

  const handleSaveTeam = async (event: FormEvent) => {
    event.preventDefault()
    if (!editingTeamId) return
    const name = editTeamName.trim()
    if (!name) {
      onToast('Enter a team name')
      return
    }
    setEditTeamBusy(true)
    try {
      await onUpdateTeam(editingTeamId, { name, ageGroup: editTeamAgeGroup })
      onToast(`Updated ${formatTeamDisplayName(name, editTeamAgeGroup)}`)
      cancelEditTeam()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to update team')
    } finally {
      setEditTeamBusy(false)
    }
  }

  const handleConfirmArchiveTeam = async () => {
    if (!teamPendingArchive) return
    const label = formatTeamDisplayName(teamPendingArchive.name, teamPendingArchive.ageGroup)
    setArchiveTeamBusy(true)
    try {
      await onArchiveTeam(teamPendingArchive.id)
      if (editingTeamId === teamPendingArchive.id) cancelEditTeam()
      setTeamPendingArchive(null)
      onToast(`Archived ${label}`)
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to archive team')
    } finally {
      setArchiveTeamBusy(false)
    }
  }

  const activeTeams = useMemo(
    () => teams.filter((team) => team.activeStatus !== false),
    [teams],
  )
  const archivedTeams = useMemo(
    () => teams.filter((team) => team.activeStatus === false),
    [teams],
  )

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const team of teams) {
      map.set(team.id, formatTeamDisplayName(team.name, team.ageGroup))
    }
    return map
  }, [teams])

  const staffRoster = useMemo(() => {
    return users.filter((user) => isActiveAppRole(user.appRole)).sort(compareStaffUsers)
  }, [users])

  const staffRosterByRole = useMemo(() => {
    return STAFF_ROSTER_ROLE_ORDER.map((role) => ({
      role,
      members: staffRoster.filter((user) => user.appRole === role),
    })).filter((group) => group.members.length > 0)
  }, [staffRoster])

  const pendingUsers = useMemo(
    () => users.filter((user) => user.appRole === 'pending'),
    [users],
  )

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
        appRole: inviteAppRole,
        teamAssignments: inviteAssignments,
        displayName: inviteName,
      })
      setInviteEmail('')
      setInviteName('')
      setInviteAppRole('coach')
      setInviteAssignments([])
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
    setInviteAssignments((prev) => {
      const exists = prev.find((row) => row.teamId === teamId)
      if (exists) return prev.filter((row) => row.teamId !== teamId)
      return [...prev, { teamId, teamRole: 'assistant_coach' }]
    })
  }

  const setInviteTeamRole = (teamId: string, teamRole: TeamRole) => {
    setInviteAssignments((prev) =>
      prev.map((row) => (row.teamId === teamId ? { ...row, teamRole } : row)),
    )
  }

  const handleRoleChange = async (userId: string, nextRole: AssignableAppRole) => {
    setBusyUserId(userId)
    try {
      await updateClubUserAppRole(userId, nextRole)
      setUsers((prev) =>
        prev.map((row) => (row.id === userId ? { ...row, appRole: nextRole } : row)),
      )
      onToast(`Updated app role to ${formatAppRoleLabel(nextRole)}`)
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setBusyUserId(null)
    }
  }

  const toggleTeam = (userId: string, teamId: string) => {
    setDraftAssignments((prev) => {
      const current = prev[userId] ?? []
      const exists = current.find((row) => row.teamId === teamId)
      const next = exists
        ? current.filter((row) => row.teamId !== teamId)
        : [...current, { teamId, teamRole: 'assistant_coach' as TeamRole }]
      return { ...prev, [userId]: next }
    })
  }

  const setDraftTeamRole = (userId: string, teamId: string, teamRole: TeamRole) => {
    setDraftAssignments((prev) => {
      const current = prev[userId] ?? []
      return {
        ...prev,
        [userId]: current.map((row) =>
          row.teamId === teamId ? { ...row, teamRole } : row,
        ),
      }
    })
  }

  const handleSaveTeams = async (user: ClubAdminUserRow) => {
    const nextAssignments = draftAssignments[user.id] ?? []
    setBusyUserId(user.id)
    try {
      await replaceClubUserTeams(user.id, nextAssignments)
      setUsers((prev) =>
        prev.map((row) =>
          row.id === user.id ? { ...row, teamAssignments: [...nextAssignments] } : row,
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
          row.id === user.id
            ? { ...row, appRole: 'pending', teamAssignments: [] }
            : row,
        ),
      )
      setDraftAssignments((prev) => ({ ...prev, [user.id]: [] }))
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
          subtitle="Directors only — seasons, teams, staff, and player development"
          onHome={onBackToHome}
        />

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 rounded-xl border-2 border-athletic/40 bg-athletic/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-foreground">
            <Shield className="size-4 shrink-0" strokeWidth={2.5} />
            Director only — manage club staff &amp; teams
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

        <div
          role="tablist"
          aria-label="Club admin sections"
          className="club-admin-tabs mt-4 grid grid-cols-3 gap-1 rounded-xl border-2 border-border bg-card p-1 sm:gap-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={adminTab === 'setup'}
            onClick={() => setAdminTab('setup')}
            className={cn(
              'inline-flex min-h-12 touch-manipulation items-center justify-center gap-1.5 rounded-lg px-2 text-[10px] font-extrabold uppercase tracking-wide sm:gap-2 sm:px-3 sm:text-xs',
              adminTab === 'setup'
                ? 'bg-neon text-neon-foreground'
                : 'bg-transparent text-muted-foreground',
            )}
          >
            <ClipboardList className="size-4 shrink-0" strokeWidth={2.5} />
            <span className="truncate">Club Setup</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={adminTab === 'staff'}
            onClick={() => setAdminTab('staff')}
            className={cn(
              'inline-flex min-h-12 touch-manipulation items-center justify-center gap-1.5 rounded-lg px-2 text-[10px] font-extrabold uppercase tracking-wide sm:gap-2 sm:px-3 sm:text-xs',
              adminTab === 'staff'
                ? 'bg-neon text-neon-foreground'
                : 'bg-transparent text-muted-foreground',
            )}
          >
            <Shield className="size-4 shrink-0" strokeWidth={2.5} />
            <span className="truncate">Staff</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={adminTab === 'players'}
            onClick={() => setAdminTab('players')}
            className={cn(
              'inline-flex min-h-12 touch-manipulation items-center justify-center gap-1.5 rounded-lg px-2 text-[10px] font-extrabold uppercase tracking-wide sm:gap-2 sm:px-3 sm:text-xs',
              adminTab === 'players'
                ? 'bg-neon text-neon-foreground'
                : 'bg-transparent text-muted-foreground',
            )}
          >
            <Users className="size-4 shrink-0" strokeWidth={2.5} />
            <span className="truncate">Players</span>
          </button>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border-2 border-danger/50 bg-danger/10 px-3 py-2 text-sm font-bold text-danger">
            {error}
          </p>
        ) : null}

        {adminTab === 'players' ? (
          <PlayerDirectoryPanel
            teams={reportTeams}
            activeSeason={activeSeason}
            onToast={onToast}
          />
        ) : null}

        {adminTab === 'setup' ? (
          <>
        <SeasonManagerPanel
          seasons={seasons}
          activeSeasonId={activeSeasonId}
          onCreateSeason={onCreateSeason}
          onUpdateSeason={onUpdateSeason}
          onActivateSeason={onActivateSeason}
          onArchiveSeason={onArchiveSeason}
          onToast={onToast}
        />

        <AgeGroupPoolPanel
          teams={teams}
          seasonId={activeSeasonId}
          loadPool={loadAgeGroupPool}
          onAssignToTeam={onAssignPoolPlayer}
          onCreatePoolPlayer={onCreatePoolPlayer}
          onSetPlayerActive={onSetPlayerActive}
          onToast={onToast}
        />

        <section className="club-admin-invite mt-6 space-y-4 rounded-2xl border-2 border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-athletic" strokeWidth={2.5} />
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              Teams
            </h2>
          </div>
          <p className="text-xs font-semibold text-muted-foreground">
            Age group prefixes the name everywhere (e.g. U11 Capybaras) and sets lineup format.
            Archive a team when it won&apos;t return next season — history and stats stay intact.
          </p>

          {activeTeams.length > 0 ? (
            <ul className="space-y-2">
              {activeTeams.map((team) => {
                const displayName = formatTeamDisplayName(team.name, team.ageGroup)
                const isEditing = editingTeamId === team.id
                return (
                  <li
                    key={team.id}
                    className="rounded-xl border-2 border-border bg-background p-3"
                  >
                    {isEditing ? (
                      <form
                        onSubmit={(event) => void handleSaveTeam(event)}
                        className="space-y-3"
                      >
                        <label className="block space-y-1.5">
                          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Age group
                          </span>
                          <select
                            value={editTeamAgeGroup}
                            onChange={(event) => {
                              if (isAgeGroup(event.target.value)) {
                                setEditTeamAgeGroup(event.target.value)
                              }
                            }}
                            className="min-h-11 w-full touch-manipulation rounded-xl border-2 border-border bg-card px-3 text-sm font-bold text-foreground"
                          >
                            {AGE_GROUPS.map((group) => (
                              <option key={group} value={group}>
                                {group} ({formatForAgeGroup(group)})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-1.5">
                          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            Team name
                          </span>
                          <input
                            type="text"
                            value={editTeamName}
                            onChange={(event) => setEditTeamName(event.target.value)}
                            className="min-h-11 w-full touch-manipulation rounded-xl border-2 border-border bg-card px-3 text-sm font-semibold text-foreground"
                            placeholder="e.g. Capybaras"
                          />
                          <p className="text-xs font-semibold text-muted-foreground">
                            Shows as{' '}
                            <span className="text-foreground">
                              {formatTeamDisplayName(
                                editTeamName.trim() || 'Team',
                                editTeamAgeGroup,
                              )}
                            </span>
                            {' · '}
                            {ageGroupFormatHint(editTeamAgeGroup)}
                          </p>
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={editTeamBusy}
                            className="min-h-11 flex-1 touch-manipulation rounded-xl border-2 border-neon bg-neon px-3 text-xs font-bold uppercase tracking-wide text-neon-foreground disabled:opacity-50"
                          >
                            {editTeamBusy ? 'Saving…' : 'Save Team'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditTeam}
                            disabled={editTeamBusy}
                            className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border-2 border-border bg-card text-foreground disabled:opacity-50"
                            aria-label="Cancel edit"
                          >
                            <X className="size-4" strokeWidth={2.5} />
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-foreground">
                            {displayName}
                          </p>
                          <p className="text-xs font-semibold text-muted-foreground">
                            {team.ageGroup
                              ? ageGroupFormatHint(
                                  normalizeAgeGroup(team.ageGroup) ?? 'U13',
                                )
                              : 'No age group set'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => beginEditTeam(team)}
                          className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border-2 border-border bg-card text-foreground"
                          aria-label={`Edit ${displayName}`}
                        >
                          <Pencil className="size-4" strokeWidth={2.5} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setTeamPendingArchive(team)}
                          className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-xl border-2 border-border bg-card text-foreground"
                          aria-label={`Archive ${displayName}`}
                        >
                          <Archive className="size-4" strokeWidth={2.5} />
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm font-semibold text-muted-foreground">
              No active teams yet — create the first one below.
            </p>
          )}

          {archivedTeams.length > 0 ? (
            <div className="space-y-2 pt-2">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Archived ({archivedTeams.length})
              </p>
              <ul className="space-y-2">
                {archivedTeams.map((team) => {
                  const displayName = formatTeamDisplayName(team.name, team.ageGroup)
                  return (
                    <li
                      key={team.id}
                      className="flex items-center gap-2 rounded-xl border-2 border-dashed border-border bg-background/60 px-3 py-3 opacity-80"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-foreground">{displayName}</p>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          Archived
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void onRestoreTeam(team.id)
                            .then(() => onToast(`Restored ${displayName}`))
                            .catch((err) =>
                              onToast(err instanceof Error ? err.message : 'Failed to restore'),
                            )
                        }}
                        className="inline-flex min-h-11 touch-manipulation items-center gap-1.5 rounded-xl border-2 border-athletic bg-athletic/10 px-3 text-xs font-bold uppercase tracking-wide text-foreground"
                      >
                        <CheckCircle2 className="size-4" strokeWidth={2.5} />
                        Restore
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}

          <form
            onSubmit={(event) => void handleCreateTeam(event)}
            className="space-y-3 border-t-2 border-border pt-4"
          >
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Create a team
            </h3>
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
                    {group} ({formatForAgeGroup(group)})
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
                placeholder={`Name (shows as ${formatTeamDisplayName(
                  newTeamName.trim() || 'Capybaras',
                  newTeamAgeGroup,
                )})`}
              />
              <button
                type="submit"
                disabled={createTeamBusy}
                className="min-h-12 shrink-0 touch-manipulation rounded-xl border-2 border-neon bg-neon px-4 text-sm font-bold uppercase tracking-wide text-neon-foreground disabled:opacity-50 sm:min-w-[10rem]"
              >
                {createTeamBusy ? 'Creating…' : 'Create Team'}
              </button>
            </div>
          </form>
        </section>
          </>
        ) : null}

        {adminTab === 'staff' ? (
          <>
        <section className="mt-6 space-y-4 rounded-2xl border-2 border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Shield className="size-5 shrink-0 text-athletic" strokeWidth={2.5} />
              <div className="min-w-0">
                <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
                  Staff Roster
                </h2>
                <p className="text-xs font-semibold text-muted-foreground">
                  Directors and Staff (with per-team coaching roles)
                  {staffRoster.length > 0 ? ` · ${staffRoster.length}` : ''}
                </p>
              </div>
            </div>
          </div>

          {loading && users.length === 0 ? (
            <p className="text-sm font-semibold text-muted-foreground">Loading staff…</p>
          ) : staffRoster.length === 0 ? (
            <p className="text-sm font-semibold text-muted-foreground">
              No active staff yet. Invite a Director or Staff member below.
            </p>
          ) : (
            <div className="space-y-5">
              {staffRosterByRole.map((group) => (
                <div key={group.role} className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    {formatAppRoleLabel(group.role)}
                    <span className="ml-1 text-foreground/70">({group.members.length})</span>
                  </h3>
                  <ul className="space-y-2">
                    {group.members.map((user) => {
                      const teamLabels = user.teamAssignments.map((assignment) => {
                        const name = teamNameById.get(assignment.teamId) ?? 'Team'
                        return `${name} · ${formatTeamRoleLabel(assignment.teamRole)}`
                      })
                      return (
                        <li
                          key={user.id}
                          className="rounded-xl border-2 border-border bg-background px-3 py-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-black text-foreground">
                                {staffDisplayName(user)}
                              </p>
                              {user.email ? (
                                <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">
                                  {user.email}
                                </p>
                              ) : null}
                            </div>
                            <span className="shrink-0 rounded-lg border-2 border-athletic/40 bg-athletic/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-foreground">
                              {formatAppRoleLabel(user.appRole)}
                            </span>
                          </div>
                          {user.id === currentUserId ? (
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-athletic">
                              You
                            </p>
                          ) : null}
                          <p className="mt-2 text-xs font-semibold text-muted-foreground">
                            {teamLabels.length > 0
                              ? teamLabels.join(' · ')
                              : 'No teams assigned'}
                          </p>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {pendingUsers.length > 0 ? (
            <p className="border-t-2 border-border pt-3 text-xs font-semibold text-muted-foreground">
              {pendingUsers.length} pending user
              {pendingUsers.length === 1 ? '' : 's'} awaiting role assignment — manage below.
            </p>
          ) : null}
        </section>

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
              App role
            </span>
            <select
              value={inviteAppRole}
              onChange={(event) => {
                const value = event.target.value
                if (isAssignableAppRole(value)) setInviteAppRole(value)
              }}
              className="min-h-11 w-full max-w-xs touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-bold text-foreground"
            >
              {ASSIGNABLE_APP_ROLES.map((role) => (
                <option key={role} value={role}>
                  {formatAppRoleLabel(role)}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Assign teams &amp; coaching roles
            </span>
            {activeTeams.length === 0 ? (
              <p className="text-xs font-semibold text-muted-foreground">
                Create teams in Club Setup first, then assign them here.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {activeTeams.map((team) => {
                  const assignment = inviteAssignments.find((row) => row.teamId === team.id)
                  const checked = Boolean(assignment)
                  return (
                    <div
                      key={team.id}
                      className={cn(
                        'space-y-2 rounded-xl border-2 px-2 py-2',
                        checked
                          ? 'border-athletic bg-athletic/10'
                          : 'border-border bg-background',
                      )}
                    >
                      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-bold text-foreground">
                        <input
                          type="checkbox"
                          className="size-5 accent-athletic"
                          checked={checked}
                          onChange={() => toggleInviteTeam(team.id)}
                        />
                        {formatTeamDisplayName(team.name, team.ageGroup)}
                      </label>
                      {assignment ? (
                        <TeamRoleSelect
                          value={assignment.teamRole}
                          onChange={(teamRole) => setInviteTeamRole(team.id, teamRole)}
                        />
                      ) : null}
                    </div>
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
                      {invite.email} · {formatAppRoleLabel(invite.appRole)} ·{' '}
                      {invite.teamAssignments.length} team
                      {invite.teamAssignments.length === 1 ? '' : 's'}
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

        {loading && users.length === 0 ? null : users.length === 0 ? (
          <p className="mt-6 text-sm font-semibold text-muted-foreground">
            No registered users yet. Create a staff account above to get started.
          </p>
        ) : (
          <section className="mt-6 space-y-3">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              Manage Access
            </h2>
            <p className="text-xs font-semibold text-muted-foreground">
              App role controls Club Admin access. Team roles control coaching permissions on each
              team.
            </p>
          <div className="club-admin-table overflow-x-auto rounded-2xl border-2 border-border bg-card">
            <table className="w-full min-w-[48rem] border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-border bg-secondary/40">
                  <th className="px-3 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    User
                  </th>
                  <th className="px-3 py-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    App Role
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
                  const selectedAssignments = draftAssignments[user.id] ?? []
                  const busy = busyUserId === user.id
                  const teamsDirty = !assignmentsEqual(
                    selectedAssignments,
                    user.teamAssignments,
                  )

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
                          value={user.appRole === 'pending' ? '' : user.appRole}
                          disabled={busy || user.id === currentUserId}
                          onChange={(event) => {
                            const value = event.target.value
                            if (!isAssignableAppRole(value)) return
                            void handleRoleChange(user.id, value)
                          }}
                          className="min-h-11 w-full max-w-[11rem] touch-manipulation rounded-xl border-2 border-border bg-background px-3 text-sm font-bold text-foreground"
                        >
                          <option value="" disabled>
                            Pending
                          </option>
                          {ASSIGNABLE_APP_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {formatAppRoleLabel(role)}
                            </option>
                          ))}
                        </select>
                        {user.appRole === 'pending' ? (
                          <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-danger">
                            Awaiting assignment
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        {activeTeams.length === 0 ? (
                          <p className="text-xs font-semibold text-muted-foreground">
                            Create teams in Club Setup first.
                          </p>
                        ) : (
                          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
                            {activeTeams.map((team) => {
                              const assignment = selectedAssignments.find(
                                (row) => row.teamId === team.id,
                              )
                              const checked = Boolean(assignment)
                              return (
                                <div
                                  key={team.id}
                                  className={cn(
                                    'space-y-2 rounded-xl border-2 px-2 py-2',
                                    checked
                                      ? 'border-athletic bg-athletic/10'
                                      : 'border-border bg-background',
                                  )}
                                >
                                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-bold text-foreground">
                                    <input
                                      type="checkbox"
                                      className="size-5 accent-athletic"
                                      checked={checked}
                                      disabled={busy}
                                      onChange={() => toggleTeam(user.id, team.id)}
                                    />
                                    {formatTeamDisplayName(team.name, team.ageGroup)}
                                  </label>
                                  {assignment ? (
                                    <TeamRoleSelect
                                      value={assignment.teamRole}
                                      disabled={busy}
                                      onChange={(teamRole) =>
                                        setDraftTeamRole(user.id, team.id, teamRole)
                                      }
                                    />
                                  ) : null}
                                </div>
                              )
                            })}
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={busy || !teamsDirty}
                          onClick={() => void handleSaveTeams(user)}
                          className="mt-2 min-h-11 w-full touch-manipulation rounded-xl border-2 border-border bg-secondary px-3 text-[11px] font-bold uppercase tracking-wide text-foreground disabled:opacity-40"
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
          </section>
        )}
          </>
        ) : null}
      </div>

      <DeleteMatchConfirmModal
        open={Boolean(teamPendingArchive)}
        matchLabel={
          teamPendingArchive
            ? formatTeamDisplayName(teamPendingArchive.name, teamPendingArchive.ageGroup)
            : undefined
        }
        busy={archiveTeamBusy}
        title="Archive Team?"
        description="Archive this team so it no longer appears in selectors?"
        detail="Matches, recaps, and stats stay in history. You can restore the team later from Club Admin."
        confirmLabel="Archive Team"
        onConfirm={() => void handleConfirmArchiveTeam()}
        onCancel={() => {
          if (!archiveTeamBusy) setTeamPendingArchive(null)
        }}
      />
    </main>
  )
}
