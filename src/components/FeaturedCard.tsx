import Link from "next/link";

import { formatCount } from "@/lib/format";
import type { AppCard, FeaturedApp } from "@/lib/types";

import { Avatar } from "./Avatar";
import { DropPlaceholder } from "./DropVideo";
import { Handle } from "./Handle";
import { TryCount } from "./TryCount";

export const FEATURED_LABELS: Record<FeaturedApp["reason"], string> = {
  featured: "Featured",
  launch: "Launch day",
  boosted: "Spotlight",
  pick: "Today's pick",
  hot: "Hot",
};

// The card for Home's rows (Featured, Just posted), Browse and profiles: the
// app's picture as a wide banner, then the name, a Try button, the tagline
// and the builder. Several fit side by side, and the next
// one peeks in on phones so it's clear the row swipes. A Featured app says
// why it's there unless it was simply picked. On a builder's profile
// (showOwner false) the footer shows likes instead of who made it.
export function FeaturedCard({
  app,
  rank,
  fill = false,
  showOwner = true,
}: {
  app: AppCard & { reason?: FeaturedApp["reason"] };
  rank: number;
  fill?: boolean;
  showOwner?: boolean;
}) {
  return (
    <article
      className={`rise flex shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-line bg-surface ${fill ? "w-full" : "w-[70vw] max-w-[272px]"}`}
      style={{ "--i": rank } as React.CSSProperties}
    >
      <Link href={`/apps/${app.slug}`} className="media-dark relative block aspect-video overflow-hidden" aria-label={app.name}>
        {app.poster_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={app.poster_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <DropPlaceholder name={app.name} category={app.category} variant="bare" />
        )}
        {/* Under the Featured heading, only say why when it's something else. */}
        {app.reason && app.reason !== "featured" && (
          <span
            className={`spot-label absolute top-2 left-2 ${app.reason === "boosted" ? "tag spot-gold" : app.reason === "pick" ? "tag spot-glass" : "tag-accent"}`}
          >
            {app.reason === "boosted" ? "★ " : ""}
            {FEATURED_LABELS[app.reason]}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-center justify-between gap-2">
          <Link href={`/apps/${app.slug}`} className="display block min-w-0 truncate text-[22px] leading-none hover:text-accent sm:text-[28px]">
            {app.name}
          </Link>
          {/* A plain link (not next/link) so prefetching never counts as a try. */}
          <a href={`/try/${app.slug}?via=card`} target="_blank" rel="noopener" className="btn-accent shrink-0 px-3 sm:px-3.5">
            Try
          </a>
        </div>
        <p className="mt-1 truncate text-sm text-muted">{app.tagline}</p>
        <div className="mt-auto flex items-center gap-1.5 pt-2.5 text-xs text-muted">
          {showOwner && (
            <>
              <Avatar username={app.owner.username} name={app.owner.display_name} src={app.owner.avatar_url} size={18} />
              <Link href={`/u/${app.owner.username}`} className="truncate hover:text-ink">
                <Handle username={app.owner.username} />
              </Link>
            </>
          )}
          <span className="ml-auto shrink-0 font-mono text-[11px]">
            <TryCount appId={app.id} count={app.try_count} /> tries{showOwner ? "" : ` · ${formatCount(app.like_count)} ♥`}
          </span>
        </div>
      </div>
    </article>
  );
}
