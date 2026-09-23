import Link from "next/link";

import { formatCount } from "@/lib/format";
import type { AppCard } from "@/lib/types";

import { Avatar } from "./Avatar";
import { DropPlaceholder } from "./DropVideo";
import { CategoryChip } from "./Tags";

// Big card for the Featured row on the home feed.
export function FeaturedCard({ app, rank, label }: { app: AppCard; rank: number; label: string }) {
  return (
    <article
      className="rise relative flex aspect-[4/5] w-[82vw] max-w-[340px] shrink-0 snap-start overflow-hidden rounded-xl border border-line bg-surface sm:aspect-[4/5]"
      style={{ "--i": rank } as React.CSSProperties}
    >
      <Link href={`/apps/${app.slug}`} className="absolute inset-0" aria-label={app.name}>
        {app.poster_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={app.poster_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <DropPlaceholder name={app.name} category={app.category} variant="bare" />
        )}
      </Link>

      <span className="tag-accent absolute top-3 left-3">
        ★ {label} · {String(rank + 1).padStart(2, "0")}
      </span>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4 pt-24">
        <Link
          href={`/u/${app.owner.username}`}
          className="pointer-events-auto mb-1.5 flex w-fit items-center gap-1.5 text-xs font-semibold"
        >
          <Avatar username={app.owner.username} name={app.owner.display_name} size={20} />@{app.owner.username}
        </Link>
        <Link href={`/apps/${app.slug}`} className="display pointer-events-auto block text-5xl hover:text-accent">
          {app.name}
        </Link>
        <p className="mt-1 line-clamp-2 text-sm text-ink/85">{app.tagline}</p>
        <div className="pointer-events-auto mt-3 flex items-center gap-2">
          {/* A plain link (not next/link) so prefetching never counts as a try. */}
          <a href={`/try/${app.slug}`} target="_blank" rel="noopener" className="btn-accent">
            Try it →
          </a>
          <CategoryChip category={app.category} />
          <span className="font-mono text-[11px] text-muted">{formatCount(app.try_count)} tries</span>
        </div>
      </div>
    </article>
  );
}
