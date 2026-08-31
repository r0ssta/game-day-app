import { useCallback, useRef, useState } from 'react'

/**
 * Tracks in-flight background match mutations for Optimistic UI.
 * Call `run` around network work after local state has already been updated;
 * on failure, `onRevert` restores UI and the caller shows a toast.
 */
export function useOptimisticSync() {
  const [pendingCount, setPendingCount] = useState(0)
  const pendingRef = useRef(0)

  const begin = useCallback(() => {
    pendingRef.current += 1
    setPendingCount(pendingRef.current)
  }, [])

  const end = useCallback(() => {
    pendingRef.current = Math.max(0, pendingRef.current - 1)
    setPendingCount(pendingRef.current)
  }, [])

  const run = useCallback(
    async <T,>(
      work: () => Promise<T>,
      options: {
        onRevert: () => void
        onErrorToast: (err: unknown) => void
        label?: string
      },
    ): Promise<T | null> => {
      begin()
      try {
        return await work()
      } catch (err) {
        console.error(`[optimistic${options.label ? `:${options.label}` : ''}]`, err)
        options.onRevert()
        options.onErrorToast(err)
        return null
      } finally {
        end()
      }
    },
    [begin, end],
  )

  return {
    syncPending: pendingCount > 0,
    pendingCount,
    run,
  }
}
