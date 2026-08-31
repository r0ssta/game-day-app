import * as Sentry from '@sentry/node'

const dsn = (process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN || '').trim()

let initialized = false

/**
 * Initialize Sentry once per serverless isolate. No-ops when no DSN is set.
 * Prefer `SENTRY_DSN` on Vercel; `VITE_SENTRY_DSN` is a local fallback.
 */
export function initApiSentry(): void {
  if (initialized || !dsn) return
  initialized = true
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    enabled: true,
  })
}

/** Log + capture a 500-class API error, then flush so Vercel does not freeze the isolate first. */
export async function reportApiError(
  route: string,
  error: unknown,
  extras?: Record<string, unknown>,
): Promise<void> {
  console.error(route, error)
  initApiSentry()
  if (!dsn) return
  Sentry.withScope((scope) => {
    scope.setTag('route', route)
    if (extras) scope.setExtras(extras)
    Sentry.captureException(error)
  })
  await Sentry.flush(2000)
}
