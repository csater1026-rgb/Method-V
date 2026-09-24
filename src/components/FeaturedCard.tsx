import Link from "next/link";

import { formatCount } from "@/lib/format";
import type { FeaturedApp } from "@/lib/types";

import { Avatar } from "./Avatar";
import { DropPlaceholder } from "./DropVideo";

const LABELS: Record<FeaturedApp["reason"], string> = {
  featured: "Featured",
  launch: "Launch day",
  boosted: "Boosted",
  hot: "Hot",
};

// Compact card for the Featured row on Home: a 16:9 thumbnail, then the
// name, tagline, builder and a Try button. Several fit side by side, and
// the next one peeks in on phones so it's clear the row swipes.
export function FeaturedCard({ app, rank }: { app: FeaturedApp; rank: number }) {
  return (
    <article
      className="rise flex w-[68vw] max-w-[260px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-line bg-surface"
      style={{ "--i": rank } as React.CSSProperties}
    >
      <Link href={`/apps/${app.slug}`} className="media-dark relative block aspect-video overflow-hidden" aria-label={app.name}>
        {app.poster_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={app.poster_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <>
            <DropPlaceholder name={app.name} category={app.category} variant="bare" />
            <span aria-hidden className="display absolute inset-x-3 bottom-2 truncate text-3xl text-ink">
              {app.name}
            </span>
          </>
        )}
        {/* Under the Featured heading, only say why when it's something else. */}
        {app.reason !== "featured" && <span className="tag-accent absolute top-2 left-2">{LABELS[app.reason]}</span>}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/apps/${app.slug}`} className="block truncate font-semibold hover:text-accent">
              {app.name}
            </Link>
            <p className="truncate text-sm text-muted">{app.tagline}</p>
          </div>
          {/* A plain link (not next/link) so prefetching never counts as a try. */}
          <a href={`/try/${app.slug}?via=card`} target="_blank" rel="noopener" className="btn-accent shrink-0 px-3.5">
            Try
          </a>
        </div>
        <div className="mt-auto flex items-center gap-1.5 text-xs text-muted">
          <Avatar username={app.owner.username} name={app.owner.display_name} size={18} />
          <Link href={`/u/${app.owner.username}`} className="truncate hover:text-ink">
            @{app.owner.username}
          </Link>
          <span className="ml-auto shrink-0 font-mono text-[11px]">{formatCount(app.try_count)} tries</span>
        </div>
      </div>
    </article>
  );
}
