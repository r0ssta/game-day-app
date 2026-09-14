import type { ChangelogRelease } from '@/data/changelog'

export function ChangelogReleaseList({ releases }: { releases: ChangelogRelease[] }) {
  return (
    <ol className="space-y-5">
      {releases.map((release) => (
        <li key={release.version} className="border-t-2 border-border pt-4 first:border-t-0 first:pt-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {release.date}
          </p>
          <h3 className="mt-1 font-display text-xl font-black uppercase tracking-wide text-foreground">
            {release.title}
          </h3>
          <ul className="mt-3 space-y-2">
            {release.features.map((feature) => (
              <li
                key={feature}
                className="flex gap-2 text-sm font-semibold leading-relaxed text-foreground"
              >
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-neon" aria-hidden />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}
