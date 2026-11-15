import { useEffect, useState } from 'react'
import { ClubParentHubScreen } from '@/components/ClubParentHubScreen'
import { ParentHubScreen } from '@/components/ParentHubScreen'
import { resolveParentHubSlug } from '@/lib/parent-club-hub'
import type { ParentHubRoute } from '@/lib/parent-hub'

type ParentHubGateProps = {
  route: ParentHubRoute
}

/**
 * Resolves /hub/:slug as club (preferred) or team, then mounts the right screen.
 * Team slugs under a known club open the club hub focused on that team.
 * Legacy team UUIDs still go straight to the classic team Parent Hub.
 */
export function ParentHubGate({ route }: ParentHubGateProps) {
  const [resolved, setResolved] = useState<
    | { kind: 'team'; route: ParentHubRoute }
    | { kind: 'club'; clubSlug: string; teamSlug?: string }
    | { kind: 'error'; message: string }
    | null
  >(route.kind === 'teamId' ? { kind: 'team', route } : null)

  useEffect(() => {
    if (route.kind === 'teamId') {
      setResolved({ kind: 'team', route })
      return
    }

    let cancelled = false
    setResolved(null)
    void resolveParentHubSlug(route.slug)
      .then((result) => {
        if (cancelled) return
        if (result.kind === 'club') {
          setResolved({ kind: 'club', clubSlug: result.clubSlug })
          return
        }
        if (result.clubSlug) {
          setResolved({
            kind: 'club',
            clubSlug: result.clubSlug,
            teamSlug: result.teamSlug || route.slug,
          })
          return
        }
        setResolved({ kind: 'team', route })
      })
      .catch((err) => {
        if (cancelled) return
        setResolved({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Hub not found',
        })
      })

    return () => {
      cancelled = true
    }
  }, [route])

  if (!resolved) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <p className="text-sm font-semibold text-muted-foreground">Loading hub…</p>
      </main>
    )
  }

  if (resolved.kind === 'error') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {resolved.message}
        </p>
      </main>
    )
  }

  if (resolved.kind === 'club') {
    return (
      <ClubParentHubScreen
        clubSlug={resolved.clubSlug}
        initialTeamSlug={resolved.teamSlug ?? null}
      />
    )
  }

  return <ParentHubScreen route={resolved.route} />
}
