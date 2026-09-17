import { useEffect, useState } from 'react'
import { AuthScreen } from '@/components/AuthScreen'
import { ScreenHeader } from '@/components/AppNavigation'
import { useAuth } from '@/contexts/AuthContext'
import { COACH_APP_PATH, replaceApp } from '@/lib/app-routes'
import { fetchAuditLogs } from '@/lib/audit-log'
import { APP_DOCUMENT_TITLE } from '@/lib/branding'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import { supabase } from '@/supabaseClient'
import type { DbAuditLog } from '@/types/database'

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatMetadata(metadata: DbAuditLog['metadata']): string {
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
    void fetchAuditLogs()
      .then((rows) => {
        if (!cancelled) setLogs(rows)
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
          subtitle="High-level usage — logins, matches created, kickoffs, and full-time"
          onHome={() => replaceApp(COACH_APP_PATH)}
        />

        {error ? (
          <p className="mt-4 rounded-xl border-2 border-danger/50 bg-danger/10 px-3 py-2 text-sm font-bold text-danger">
            {error}
          </p>
        ) : null}

        {loadingLogs ? (
          <p className="mt-6 text-sm font-semibold text-muted-foreground">Loading activity…</p>
        ) : logs.length === 0 ? (
          <p className="mt-6 text-sm font-semibold text-muted-foreground">No activity logged yet.</p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-2xl border-2 border-border bg-card">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b-2 border-border bg-background text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Timestamp</th>
                  <th className="px-3 py-3">User ID</th>
                  <th className="px-3 py-3">Action</th>
                  <th className="px-3 py-3">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => (
                  <tr key={row.id} className="border-b border-border align-top last:border-b-0">
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-foreground">
                      {formatTimestamp(row.created_at)}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">
                      {row.user_id ?? '—'}
                    </td>
                    <td className="px-3 py-3 font-bold uppercase tracking-wide text-foreground">
                      {row.action_type}
                    </td>
                    <td className="px-3 py-3">
                      <pre className="max-w-[28rem] overflow-x-auto whitespace-pre-wrap text-xs font-semibold text-muted-foreground">
                        {formatMetadata(row.metadata)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
