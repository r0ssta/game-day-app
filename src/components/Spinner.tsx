import { Suspense, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type SpinnerProps = {
  className?: string
  label?: string
  /** Fill the viewport (route / screen fallback). */
  fullScreen?: boolean
  /** Cover the viewport while a modal chunk loads. */
  overlay?: boolean
}

export function Spinner({
  className,
  label = 'Loading…',
  fullScreen = false,
  overlay = false,
}: SpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center',
        fullScreen && 'min-h-dvh bg-background',
        overlay && 'fixed inset-0 z-[100] bg-background/60',
        !fullScreen && !overlay && 'min-h-40',
        className,
      )}
    >
      <Loader2 className="size-8 animate-spin text-neon" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function ScreenSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Spinner fullScreen />}>{children}</Suspense>
}

export function ModalSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Spinner overlay />}>{children}</Suspense>
}
