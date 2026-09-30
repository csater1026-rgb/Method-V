import Link from "next/link";

import { formatCount, formatDuration } from "@/lib/format";
import type { ProfileDrop } from "@/lib/types";

import { DropPlaceholder } from "./DropVideo";

// A builder's Drops as tall tiles, newest first, at the top of their profile.
// Tapping one opens the Drops feed on it. On your own profile the first tile
// posts a new one.
export function ProfileDrops({ drops, isSelf }: { drops: ProfileDrop[]; isSelf: boolean }) {
  if (drops.length === 0 && !isSelf) return null;
  return (
    <ul aria-label="Drops" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {isSelf && (
        <li>
          <Link
            href="/submit"
            className="flex aspect-[9/16] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface p-4 text-center transition hover:border-accent"
          >
            <span className="display text-5xl text-accent" aria-hidden>
              +
            </span>
            <span className="font-semibold">Post a Drop</span>
            <span className="text-xs text-muted">A 60-second demo of what you built</span>
          </Link>
        </li>
      )}
      {drops.map((drop) => (
        <li key={drop.id}>
          <Link
            href={`/drops?d=${drop.id}`}
            aria-label={`${drop.app.name} Drop${drop.caption ? `: ${drop.caption}` : ""}`}
            className="media-dark group relative block aspect-[9/16] overflow-hidden rounded-xl border border-line bg-surface"
          >
            {drop.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={drop.image_url} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
            ) : (
              <DropPlaceholder name={drop.app.name} category={drop.app.category} variant="bare" />
            )}
            <span className="absolute top-2 left-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
              ▶ {formatDuration(drop.duration_seconds)}
            </span>
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2.5 pt-10 text-white">
              <span className="display block truncate text-xl leading-tight">{drop.app.name}</span>
              {drop.caption && <span className="line-clamp-2 text-xs text-white/80">{drop.caption}</span>}
              <span className="mt-1 block font-mono text-[10px] text-white/70">
                ♥ {formatCount(drop.like_count)} · 💬 {formatCount(drop.comment_count)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
