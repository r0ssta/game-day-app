import { useEffect, useState } from 'react'
import { AuthScreen } from '@/components/AuthScreen'
import { ScreenHeader } from '@/components/AppNavigation'
import { useAuth } from '@/contexts/AuthContext'
import { COACH_APP_PATH, replaceApp } from '@/lib/app-routes'
import {
  extraAuditMetadata,
  emailFromAuditMetadata,
  fetchAuditLogs,
  fetchStaffLastSeen,
  summarizeLastActive,
  type StaffLastActive,
} from '@/lib/audit-log'
import { APP_DOCUMENT_TITLE } from '@/lib/branding'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import { supabase } from '@/supabaseClient'
import type { DbAuditLog } from '@/types/database'

function formatRelative(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const deltaMs = Date.now() - date.getTime()
  if (deltaMs < 60_000) return 'just now'
  if (deltaMs < 3_600_000) return `${Math.floor(deltaMs / 60_000)} min ago`
  if (deltaMs < 86_400_000) return `${Math.floor(deltaMs / 3_600_000)} hr ago`
  const days = Math.floor(deltaMs / 86_400_000)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatMetadata(metadata: ReturnType<typeof extraAuditMetadata>): string {
  try {
    return JSON.stringify(metadata ?? {}, null, 2)
  } catch {
    return String(metadata)
  }
}

export function SuperAdminActivityScreen() {
  const { loading, accessLoading, isAuthenticated, user } = useAuth()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [logs, setLogs] = useState<DbAuditLog[]>([])
  const [lastActive, setLastActive] = useState<StaffLastActive[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loadingLogs, setLoadingLogs] = useState(false)

  useEffect(() => {
    if (loading || accessLoading || !isAuthenticated || !user?.id) {
      setAllowed(null)
      return
    }

    let cancelled = false
    void (async () => {
      const { data, error: lookupError } = await supabase
        .from('system_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled) return
      if (lookupError) {
        setError(lookupError.message)
        setAllowed(false)
        replaceApp(COACH_APP_PATH)
        return
      }

      const isAdmin = Boolean(data?.user_id)
      setAllowed(isAdmin)
      if (!isAdmin) {
        replaceApp(COACH_APP_PATH)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [accessLoading, isAuthenticated, loading, user?.id])

  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    setLoadingLogs(true)
    setError(null)
    void Promise.all([fetchAuditLogs(), fetchStaffLastSeen().catch(() => null)])
      .then(([rows, seen]) => {
        if (cancelled) return
        setLogs(rows)
        setLastActive(seen ?? summarizeLastActive(rows))
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load audit logs')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingLogs(false)
      })
    return () => {
      cancelled = true
    }
  }, [allowed])

  useEffect(() => {
    const previous = document.title
    document.title = `Activity · ${APP_DOCUMENT_TITLE}`
    return () => {
      document.title = previous
    }
  }, [])

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <p className="text-sm font-semibold text-muted-foreground">Checking session…</p>
      </main>
    )
  }

  if (!isAuthenticated) {
    return <AuthScreen />
  }

  if (accessLoading || allowed !== true) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <p className="text-sm font-semibold text-muted-foreground">Checking admin access…</p>
      </main>
    )
  }

  return (
    <main className={APP_SHELL}>
      <div className={`${APP_CONTAINER} pb-10 pt-6`}>
        <ScreenHeader
          title="Activity"
          subtitle="Who had the staff app open recently — not every tap on the pitch"
          onHome={() => replaceApp(COACH_APP_PATH)}
        />

        {error ? (
          <p className="mt-4 rounded-xl border-2 border-danger/50 bg-danger/10 px-3 py-2 text-sm font-bold text-danger">
            {error}
          </p>
        ) : null}

        {loadingLogs ? (
          <p className="mt-6 text-sm font-semibold text-muted-foreground">Loading activity…</p>
        ) : lastActive.length === 0 && logs.length === 0 ? (
          <p className="mt-6 text-sm font-semibold text-muted-foreground">No activity logged yet.</p>
        ) : (
          <>
            <section className="mt-6">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Last active
              </h2>
              {lastActive.length === 0 ? (
                <p className="mt-3 text-sm font-semibold text-muted-foreground">No recent staff activity.</p>
              ) : (
                <div className="mt-3 overflow-x-auto rounded-2xl border-2 border-border bg-card">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b-2 border-border bg-background text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-3">Staff</th>
                        <th className="px-3 py-3">Last seen</th>
                        <th className="px-3 py-3">Last action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastActive.map((row) => (
                        <tr key={row.userId} className="border-b border-border last:border-b-0">
                          <td className="px-3 py-3">
                            <p className="font-semibold text-foreground">{row.email ?? 'Unknown email'}</p>
                            <p className="font-mono text-xs text-muted-foreground">{row.userId}</p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 font-semibold text-foreground">
                            {formatRelative(row.lastAt)}
                            <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                              {formatTimestamp(row.lastAt)}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-bold uppercase tracking-wide text-foreground">
                            {row.lastAction}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="mt-8">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Event log
              </h2>
              <div className="mt-3 overflow-x-auto rounded-2xl border-2 border-border bg-card">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b-2 border-border bg-background text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">Timestamp</th>
                      <th className="px-3 py-3">Staff</th>
                      <th className="px-3 py-3">Action</th>
                      <th className="px-3 py-3">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((row) => {
                      const extra = extraAuditMetadata(row.metadata)
                      return (
                      <tr key={row.id} className="border-b border-border align-top last:border-b-0">
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-foreground">
                          {formatTimestamp(row.created_at)}
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-semibold text-foreground">
                            {emailFromAuditMetadata(row.metadata) ?? '—'}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {row.user_id ?? '—'}
                          </p>
                        </td>
                        <td className="px-3 py-3 font-bold uppercase tracking-wide text-foreground">
                          {row.action_type}
                        </td>
                        <td className="px-3 py-3">
                          {extra ? (
                            <pre className="max-w-[28rem] overflow-x-auto whitespace-pre-wrap text-xs font-semibold text-muted-foreground">
                              {formatMetadata(extra)}
                            </pre>
                          ) : (
                            <span className="text-xs font-semibold text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
