import * as Sentry from '@sentry/react'

const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim() || ''

let initialized = false

/** Initialize Sentry once at app boot. No-ops when `VITE_SENTRY_DSN` is unset. */
export function initSentry(): void {
  if (initialized || !dsn) return
  initialized = true

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: import.meta.env.PROD ? 0.15 : 1.0,
    // iOS Safari rejects SW update() when newestWorker is gone — not actionable.
    ignoreErrors: ['newestWorker is null'],
    // Avoid noisy local Vite HMR noise in development unless debugging.
    enabled: Boolean(dsn),
  })
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!dsn) return
  if (context) {
    Sentry.withScope((scope) => {
      scope.setExtras(context)
      Sentry.captureException(error)
    })
    return
  }
  Sentry.captureException(error)
}

export { Sentry }
