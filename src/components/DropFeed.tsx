"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { formatCount, formatDuration } from "@/lib/format";
import type { FeedItem } from "@/lib/types";

import { Avatar } from "./Avatar";
import { DropPlaceholder } from "./DropVideo";
import { LikeButton } from "./LikeButton";
import { ShareButton } from "./ShareButton";
import { SponsoredBy } from "./Sponsored";
import { CategoryChip } from "./Tags";

// Vertical, swipeable feed. Each Drop fills the screen; the one in view plays
// (muted until someone taps for sound), the rest pause, and its caption
// slides in as it lands.
export function DropFeed({ items, signedIn }: { items: FeedItem[]; signedIn: boolean }) {
  const [muted, setMuted] = useState(true);

  return (
    <div
      className="no-scrollbar h-[calc(100dvh-var(--chrome)-var(--tabbar))] snap-y snap-mandatory overflow-y-scroll"
      data-testid="drop-feed"
    >
      {items.map((item, i) => (
        <DropSlide
          key={item.id}
          item={item}
          first={i === 0}
          signedIn={signedIn}
          muted={muted}
          onToggleSound={() => setMuted((m) => !m)}
        />
      ))}
    </div>
  );
}

type SlideProps = {
  item: FeedItem;
  first: boolean;
  signedIn: boolean;
  muted: boolean;
  onToggleSound: () => void;
};

function DropSlide({ item, first, signedIn, muted, onToggleSound }: SlideProps) {
  const slideRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(first);

  useEffect(() => {
    const slide = slideRef.current;
    if (!slide) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setActive(entry.isIntersecting);
        const video = videoRef.current;
        if (!video) return;
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.6 },
    );
    observer.observe(slide);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  const { app, owner } = item;
  const reveal = `transition duration-500 ease-out ${active ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`;

  return (
    <article
      ref={slideRef}
      className="flex h-full snap-start snap-always items-center justify-center sm:py-4"
      aria-label={`${app.name} Drop`}
    >
      <div className="media-dark relative aspect-[9/16] h-full max-w-full overflow-hidden bg-surface sm:rounded-xl sm:border sm:border-line">
        {item.video_url ? (
          <video
            ref={videoRef}
            src={item.video_url}
            poster={item.poster_url ?? undefined}
            className="h-full w-full cursor-pointer object-cover"
            loop
            muted
            playsInline
            preload="metadata"
            onClick={onToggleSound}
          />
        ) : (
          <DropPlaceholder name={app.name} category={app.category} variant="feed" />
        )}

        {item.video_url && (
          <button
            type="button"
            onClick={onToggleSound}
            className="absolute top-24 right-3 rounded-md bg-black/55 px-2.5 py-1 font-mono text-[10.5px] tracking-wide uppercase backdrop-blur"
          >
            {muted ? "Tap for sound" : "Sound on"}
          </button>
        )}
        <span className="absolute top-24 left-3 rounded-md bg-black/55 px-2 py-0.5 font-mono text-[11px] backdrop-blur">
          {formatDuration(item.duration_seconds)}
        </span>

        <div className="absolute right-2.5 bottom-32 flex flex-col items-center gap-5">
          <LikeButton dropId={item.id} initialLiked={item.liked} initialCount={item.like_count} signedIn={signedIn} />
          <Link
            href={`/apps/${app.slug}#comments`}
            aria-label="Comments"
            className="flex flex-col items-center gap-1 font-mono text-[11px] font-semibold drop-shadow"
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" strokeLinejoin="round" />
            </svg>
            <span>{formatCount(item.comment_count)}</span>
          </Link>
          <ShareButton path={`/apps/${app.slug}`} title={`${app.name} on Method V`} />
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/65 to-transparent p-4 pt-20">
          <div className={reveal}>
            <Link href={`/u/${owner.username}`} className="mb-2 flex w-fit items-center gap-2 text-sm font-semibold">
              <Avatar username={owner.username} name={owner.display_name} size={26} />@{owner.username}
            </Link>
            <Link href={`/apps/${app.slug}`} className="display block text-[42px] hover:text-accent">
              {app.name}
            </Link>
            <p className="mt-1 line-clamp-2 pr-14 text-sm text-ink/85">{item.caption || app.tagline}</p>
          </div>
          <div className={`mt-3 flex items-center gap-2 ${reveal} delay-100`}>
            {/* A plain link (not next/link) so prefetching never counts as a try. */}
            <a href={`/try/${app.slug}`} target="_blank" rel="noopener" className="btn-accent px-5">
              Try it →
            </a>
            <CategoryChip category={app.category} />
            <span className="font-mono text-[11px] text-muted">{formatCount(app.try_count)} tries</span>
          </div>
          {item.sponsor && (
            <div className={`mt-2 w-fit max-w-[80%] ${reveal} delay-150`}>
              <SponsoredBy sponsor={item.sponsor} compact />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
