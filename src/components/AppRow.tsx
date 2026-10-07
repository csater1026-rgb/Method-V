import Link from "next/link";

import { formatCount } from "@/lib/format";
import type { AppCard } from "@/lib/types";

import { AppLogo } from "./AppLogo";
import { DropPlaceholder } from "./DropVideo";
import { Handle } from "./Handle";
import { CategoryChip } from "./Tags";
import { TryCount } from "./TryCount";

// One app as a row, for long lists (Browse): its logo, name and tagline, a
// small screenshot (on wider screens), and a Try button.
export function AppRow({ app, index = 0 }: { app: AppCard; index?: number }) {
  return (
    <article
      className="group rise flex items-center gap-3 rounded-xl border border-line bg-surface p-3 transition hover:border-accent/60 sm:gap-4"
      style={{ "--i": Math.min(index, 12) } as React.CSSProperties}
    >
      <Link href={`/apps/${app.slug}`} tabIndex={-1} aria-hidden className="shrink-0">
        <AppLogo name={app.name} src={app.logo_url} size={52} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={`/apps/${app.slug}`} className="display truncate text-[26px] leading-none hover:text-accent">
            {app.name}
          </Link>
          <span className="hidden shrink-0 sm:inline-flex">
            <CategoryChip category={app.category} />
          </span>
        </div>
        <p className="mt-1 truncate text-sm text-muted">{app.tagline}</p>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-muted">
          <Link href={`/u/${app.owner.username}`} className="truncate hover:text-ink">
            <Handle username={app.owner.username} />
          </Link>
          <span className="shrink-0">
            · <TryCount appId={app.id} count={app.try_count} /> tries · {formatCount(app.like_count)} ♥
          </span>
        </p>
      </div>
      <Link
        href={`/apps/${app.slug}`}
        tabIndex={-1}
        aria-hidden
        className="hidden aspect-[16/10] w-32 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2 sm:block"
      >
        {app.poster_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={app.poster_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <DropPlaceholder name={app.name} category={app.category} variant="bare" />
        )}
      </Link>
      {/* A plain link (not next/link) so prefetching never counts as a try. */}
      <a href={`/try/${app.slug}?via=card`} target="_blank" rel="noopener" className="btn-accent shrink-0 px-3.5">
        Try
      </a>
    </article>
  );
}
