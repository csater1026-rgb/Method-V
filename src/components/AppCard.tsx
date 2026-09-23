import Link from "next/link";

import { formatCount } from "@/lib/format";
import type { AppCard as AppCardData } from "@/lib/types";

import { Avatar } from "./Avatar";
import { DropPlaceholder } from "./DropVideo";
import { CategoryChip, PricingStage } from "./Tags";

export function AppCard({ app, showOwner = true }: { app: AppCardData; showOwner?: boolean }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-muted/40">
      <Link href={`/apps/${app.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-surface-2">
        {app.poster_url ? (
          // Posters come from Supabase Storage at any size, so a plain img is simplest here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={app.poster_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <DropPlaceholder name={app.name} category={app.category} />
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/apps/${app.slug}`} className="text-lg leading-tight font-bold hover:underline">
            {app.name}
          </Link>
          <CategoryChip category={app.category} />
        </div>
        <p className="line-clamp-2 text-sm text-muted">{app.tagline}</p>
        <div className="flex flex-wrap gap-1.5">
          <PricingStage pricing={app.pricing} stage={app.stage} />
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-xs text-muted">
          {showOwner ? (
            <Link href={`/u/${app.owner.username}`} className="flex items-center gap-1.5 hover:text-ink">
              <Avatar username={app.owner.username} name={app.owner.display_name} size={20} />@{app.owner.username}
            </Link>
          ) : (
            <span />
          )}
          <span>
            {formatCount(app.try_count)} tries · {formatCount(app.like_count)} likes
          </span>
        </div>
      </div>
    </article>
  );
}
