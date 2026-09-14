import { useEffect } from 'react'
import { ClubBrandMark } from '@/components/ClubBrandMark'
import { ChangelogReleaseList } from '@/components/ChangelogReleaseList'
import { BackToHomeButton } from '@/components/AppNavigation'
import { CHANGELOG } from '@/data/changelog'
import { navigateApp } from '@/lib/app-routes'
import { APP_CONTAINER, APP_SHELL } from '@/lib/layout'
import { APP_DOCUMENT_TITLE } from '@/lib/branding'

export function ChangelogPage() {
  useEffect(() => {
    const previous = document.title
    document.title = `What’s New · ${APP_DOCUMENT_TITLE}`
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <main className={`${APP_SHELL} min-h-dvh pb-10 md:pb-12`}>
      <div className={`${APP_CONTAINER} space-y-6 pt-6 md:pt-8`}>
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <ClubBrandMark size="sm" />
            <p className="mt-4 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Coach app
            </p>
            <h1 className="mt-1 font-display text-3xl font-bold uppercase tracking-wide text-foreground">
              What’s New
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Every shipped grouping, newest first.</p>
          </div>
          <BackToHomeButton onClick={() => navigateApp('/')} />
        </header>

        <ChangelogReleaseList releases={CHANGELOG} />
      </div>
    </main>
  )
}
