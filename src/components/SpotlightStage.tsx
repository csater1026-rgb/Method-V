import Link from "next/link";

import { STAGE_SPOTS } from "@/lib/spotlight-stage";
import type { FeaturedApp } from "@/lib/types";

import { Avatar } from "./Avatar";
import { DropPlaceholder } from "./DropVideo";
import { FEATURED_LABELS, FeaturedCard } from "./FeaturedCard";
import { Handle } from "./Handle";
import { TryCount } from "./TryCount";

// The Spotlight on Home: a night stage with a light rail on top. One app on
// top under the big light, three under it with a light each; the light falls
// behind them (so they stay crisp) and glows on the floor. Paid Spotlights
// come first (see lib/spotlight-stage.ts) and wear a gold tag. Empty spots
// invite builders to book one.
export function SpotlightStage({
  apps,
  bookHref,
}: {
  apps: FeaturedApp[];
  bookHref: string;
}) {
  const [top, ...rest] = apps;
  const under = rest.slice(0, STAGE_SPOTS - 1);
  const open = STAGE_SPOTS - 1 - under.length;

  return (
    <section
      aria-label="In the Spotlight"
      data-tour="featured"
      className="stage media-dark relative mx-4 mt-3 overflow-hidden rounded-2xl border border-[rgb(var(--stage-glow)/0.25)] px-3 pt-24 pb-8 sm:px-6"
    >
      <span aria-hidden className="stage-rail absolute inset-x-6 top-9 h-px" />

      {top ? (
        <div className="relative mx-auto max-w-3xl">
          <Light
            big
            className="absolute -top-[56px] left-1/2 -translate-x-1/2"
          />
          <span
            aria-hidden
            className="stage-beam stage-beam-wide absolute -inset-x-[16%] -top-12 -bottom-6"
          />
          <span
            aria-hidden
            className="stage-pool absolute -bottom-7 left-1/2 h-10 w-[95%] -translate-x-1/2"
          />
          <HeroCard app={top} />
        </div>
      ) : (
        <OpenSpot href={bookHref} big />
      )}

      <span aria-hidden className="stage-rail relative mt-14 block h-px" />
      <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-6 sm:grid sm:grid-cols-3 sm:overflow-visible">
        {under.map((app, i) => (
          <div
            key={app.id}
            className="relative w-[72vw] max-w-[300px] shrink-0 snap-start pt-14 sm:w-auto sm:max-w-none"
          >
            <Light className="absolute top-0 left-1/2 -translate-x-1/2" />
            <span
              aria-hidden
              className="stage-beam absolute -inset-x-[14%] top-1 -bottom-3"
            />
            <span
              aria-hidden
              className="stage-pool absolute -bottom-5 left-1/2 h-8 w-full -translate-x-1/2"
            />
            <div className="relative rounded-xl shadow-[0_18px_40px_-22px_rgb(var(--stage-glow)/0.55)]">
              <FeaturedCard app={app} rank={i + 1} fill />
            </div>
          </div>
        ))}
        {Array.from({ length: top ? open : 0 }, (_, i) => (
          <div
            key={`open-${i}`}
            className="relative w-[72vw] max-w-[300px] shrink-0 snap-start pt-14 sm:w-auto sm:max-w-none"
          >
            <Light off className="absolute top-0 left-1/2 -translate-x-1/2" />
            <OpenSpot href={bookHref} />
          </div>
        ))}
      </div>
    </section>
  );
}

function HeroCard({ app }: { app: FeaturedApp }) {
  return (
    <div className="stage-hero rise relative rounded-[14px] p-px">
      <article className="relative grid overflow-hidden rounded-[13px] bg-[var(--stage-card)] text-white sm:grid-cols-[1.15fr_1fr]">
        <Link
          href={`/apps/${app.slug}`}
          className="relative block aspect-video overflow-hidden"
          aria-label={app.name}
        >
          {app.poster_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={app.poster_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <DropPlaceholder name={app.name} category={app.category} />
          )}
        </Link>
        <div className="flex flex-col gap-2 p-4 sm:p-5">
          <span
            className={`tag spot-label self-start ${app.reason === "boosted" ? "spot-gold" : "spot-glass"}`}
          >
            {app.reason === "featured"
              ? "★ In the Spotlight"
              : `★ ${FEATURED_LABELS[app.reason]}`}
          </span>
          <Link
            href={`/apps/${app.slug}`}
            className="display text-5xl leading-none break-words hover:text-accent sm:text-6xl"
          >
            {app.name}
          </Link>
          <p className="text-sm text-white/80">{app.tagline}</p>
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
            {/* A plain link (not next/link) so prefetching never counts as a try. */}
            <a
              href={`/try/${app.slug}?via=card`}
              target="_blank"
              rel="noopener"
              className="btn-accent px-5"
            >
              Try it →
            </a>
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-white/70">
              <Avatar
                username={app.owner.username}
                name={app.owner.display_name}
                src={app.owner.avatar_url}
                size={18}
              />
              <Link
                href={`/u/${app.owner.username}`}
                className="truncate hover:text-white"
              >
                <Handle username={app.owner.username} />
              </Link>
              <span className="font-mono">
                · <TryCount appId={app.id} count={app.try_count} /> tries
              </span>
            </span>
          </div>
        </div>
      </article>
    </div>
  );
}

function OpenSpot({ href, big = false }: { href: string; big?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-accent/35 bg-white/[0.02] p-4 text-center text-white/80 transition hover:border-accent hover:text-white ${
        big ? "mx-auto aspect-[16/6] max-w-3xl" : "aspect-video"
      }`}
    >
      <span className="display text-3xl">This spot is open</span>
      <span className="text-sm">Put your app here with the Spotlight →</span>
    </Link>
  );
}

// A small light on the rail (glowing unless the spot below is empty).
function Light({
  big = false,
  off = false,
  className = "",
}: {
  big?: boolean;
  off?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`z-20 block rounded-full ${off ? "border border-white/10 bg-[var(--stage-housing)]" : "stage-light"} ${big ? "h-3.5 w-20" : "h-3 w-12"} ${className}`}
    />
  );
}
