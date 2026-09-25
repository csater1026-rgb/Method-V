import Link from "next/link";

import { formatCount } from "@/lib/format";
import type { AppCard as AppCardData } from "@/lib/types";

import { Avatar } from "./Avatar";
import { DropPlaceholder } from "./DropVideo";
import { CategoryChip, PricingStage } from "./Tags";
import { Handle } from "./Handle";

type Props = { app: AppCardData; showOwner?: boolean; index?: number };

export function AppCard({ app, showOwner = true, index = 0 }: Props) {
  return (
    <article
      className="group rise flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition duration-300 hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-[0_10px_30px_-12px_rgb(var(--glow)/0.55)]"
      style={{ "--i": Math.min(index, 12) } as React.CSSProperties}
    >
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
          <Link href={`/apps/${app.slug}`} className="display text-[30px] hover:text-accent">
            {app.name}
          </Link>
          <CategoryChip category={app.category} />
        </div>
        <p className="line-clamp-2 text-sm text-muted">{app.tagline}</p>
        <div className="flex flex-wrap gap-1.5">
          <PricingStage pricing={app.pricing} stage={app.stage} />
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
          {showOwner ? (
            <Link href={`/u/${app.owner.username}`} className="flex items-center gap-1.5 hover:text-ink">
              <Avatar username={app.owner.username} name={app.owner.display_name} src={app.owner.avatar_url} size={20} /><Handle username={app.owner.username} />
            </Link>
          ) : (
            <span />
          )}
          <span className="font-mono text-[11px]">
            {formatCount(app.try_count)} tries · {formatCount(app.like_count)} ♥
          </span>
        </div>
      </div>
    </article>
  );
}
