import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { isStaleChunkError } from '@/lib/lazy-import'
import { captureException } from '@/lib/sentry'
import { cn } from '@/lib/utils'

type ErrorBoundaryProps = {
  children: ReactNode
  /** Remount / clear error when this value changes (e.g. matchId, route slug). */
  resetKey?: string | number | null
  /** Short label shown in the fallback card title. */
  sectionLabel?: string
  /** Optional compact layout for nested panels. */
  className?: string
  onError?: (error: Error, info: ErrorInfo) => void
}

type ErrorBoundaryState = {
  error: Error | null
}

/**
 * Catches render-time JS errors in the child tree and shows a mobile-friendly
 * recovery card instead of a blank white screen.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', this.props.sectionLabel ?? 'section', error, info.componentStack)
    captureException(error, {
      section: this.props.sectionLabel ?? 'section',
      componentStack: info.componentStack,
    })
    this.props.onError?.(error, info)
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  private handleRetry = () => {
    if (this.state.error && isStaleChunkError(this.state.error)) {
      window.location.reload()
      return
    }
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const title = this.props.sectionLabel
      ? `${this.props.sectionLabel} hit a problem`
      : 'Something went wrong'

    return (
      <div
        className={cn(
          'flex min-h-[12rem] w-full items-center justify-center px-4 py-8',
          this.props.className,
        )}
        role="alert"
      >
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger">
              <AlertTriangle className="size-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-bold uppercase tracking-wide text-foreground">
                {title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This section crashed unexpectedly. Your other screens should still work — try
                reloading just this part.
              </p>
              {import.meta.env.DEV ? (
                <p className="mt-2 break-words rounded-lg bg-secondary/60 px-2.5 py-2 font-mono text-[11px] text-muted-foreground">
                  {error.message}
                </p>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-5 flex w-full min-h-12 touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-border bg-background px-4 py-3 text-sm font-bold uppercase tracking-wide text-foreground active:scale-[0.98]"
          >
            <RefreshCw className="size-4" aria-hidden />
            Try Again
          </button>
        </div>
      </div>
    )
  }
}
