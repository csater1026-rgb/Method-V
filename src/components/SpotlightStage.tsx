import Link from "next/link";

import { STAGE_SPOTS } from "@/lib/spotlight-stage";
import type { FeaturedApp } from "@/lib/types";

import { Avatar } from "./Avatar";
import { DropPlaceholder } from "./DropVideo";
import { FEATURED_LABELS, FeaturedCard } from "./FeaturedCard";
import { Handle } from "./Handle";
import { TryCount } from "./TryCount";

// The Spotlight on Home: a stage under a lighting rig. One app on top under
// the big lamp, three under it with a lamp each, light falling on all of
// them. Paid Spotlights come first (see lib/spotlight-stage.ts). Empty spots
// invite builders to book one.
export function SpotlightStage({ apps, bookHref }: { apps: FeaturedApp[]; bookHref: string }) {
  const [top, ...rest] = apps;
  const under = rest.slice(0, STAGE_SPOTS - 1);
  const open = STAGE_SPOTS - 1 - under.length;

  return (
    <section
      aria-label="In the Spotlight"
      data-tour="featured"
      className="stage media-dark relative mx-4 mt-3 overflow-hidden rounded-2xl border border-line px-3 pt-20 pb-6 sm:px-6 sm:pt-24"
    >
      {/* The rig the lamps hang from. */}
      <Truss />

      {top ? (
        <div className="relative mx-auto max-w-3xl">
          <Lamp big className="absolute -top-[74px] left-1/2 -translate-x-1/2 sm:-top-[90px]" />
          <HeroCard app={top} />
          <span aria-hidden className="stage-lit absolute inset-0 z-10 rounded-xl" />
          <span aria-hidden className="stage-beam stage-beam-wide absolute -inset-x-[14%] -top-8 -bottom-4 z-10" />
          <span aria-hidden className="stage-pool absolute -bottom-6 left-1/2 h-10 w-[110%] -translate-x-1/2" />
        </div>
      ) : (
        <OpenSpot href={bookHref} big />
      )}

      <div className="no-scrollbar mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-6 sm:grid sm:grid-cols-3 sm:overflow-visible">
        {under.map((app, i) => (
          <div key={app.id} className="relative w-[72vw] max-w-[300px] shrink-0 snap-start pt-10 sm:w-auto sm:max-w-none">
            <Lamp className="absolute top-0 left-1/2 -translate-x-1/2" />
            <FeaturedCard app={app} rank={i + 1} fill />
            <span aria-hidden className="stage-lit absolute inset-x-0 top-10 bottom-0 z-10 rounded-xl" />
            <span aria-hidden className="stage-beam absolute -inset-x-[12%] top-6 -bottom-3 z-10" />
            <span aria-hidden className="stage-pool absolute -bottom-5 left-1/2 h-8 w-[110%] -translate-x-1/2" />
          </div>
        ))}
        {Array.from({ length: top ? open : 0 }, (_, i) => (
          <div key={`open-${i}`} className="relative w-[72vw] max-w-[300px] shrink-0 snap-start pt-10 sm:w-auto sm:max-w-none">
            <Lamp off className="absolute top-0 left-1/2 -translate-x-1/2" />
            <OpenSpot href={bookHref} />
          </div>
        ))}
      </div>
    </section>
  );
}

function HeroCard({ app }: { app: FeaturedApp }) {
  return (
    <article className="rise relative grid overflow-hidden rounded-xl border border-white/15 bg-[#0f1b29] text-white sm:grid-cols-[1.15fr_1fr]">
      <Link href={`/apps/${app.slug}`} className="relative block aspect-video overflow-hidden" aria-label={app.name}>
        {app.poster_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={app.poster_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <DropPlaceholder name={app.name} category={app.category} />
        )}
      </Link>
      <div className="flex flex-col gap-2 p-4 sm:p-5">
        <span className="tag-accent self-start">{app.reason === "featured" ? "★ In the Spotlight" : `★ ${FEATURED_LABELS[app.reason]}`}</span>
        <Link href={`/apps/${app.slug}`} className="display text-5xl leading-none break-words hover:text-accent sm:text-6xl">
          {app.name}
        </Link>
        <p className="text-sm text-white/80">{app.tagline}</p>
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
          {/* A plain link (not next/link) so prefetching never counts as a try. */}
          <a href={`/try/${app.slug}?via=card`} target="_blank" rel="noopener" className="btn-accent px-5">
            Try it →
          </a>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-white/70">
            <Avatar username={app.owner.username} name={app.owner.display_name} src={app.owner.avatar_url} size={18} />
            <Link href={`/u/${app.owner.username}`} className="truncate hover:text-white">
              <Handle username={app.owner.username} />
            </Link>
            <span className="font-mono">
              · <TryCount appId={app.id} count={app.try_count} /> tries
            </span>
          </span>
        </div>
      </div>
    </article>
  );
}

function OpenSpot({ href, big = false }: { href: string; big?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/25 p-4 text-center text-white/80 transition hover:border-accent hover:text-white ${
        big ? "mx-auto aspect-[16/6] max-w-3xl" : "aspect-video"
      }`}
    >
      <span className="display text-3xl">This spot is open</span>
      <span className="text-sm">Put your app here with the Spotlight →</span>
    </Link>
  );
}

// The bar across the top of the stage.
function Truss() {
  return (
    <svg aria-hidden className="absolute inset-x-0 top-0 h-4 w-full" preserveAspectRatio="none" viewBox="0 0 400 16">
      <defs>
        <pattern id="truss" width="16" height="16" patternUnits="userSpaceOnUse">
          <path d="M0 2 L16 14 M0 14 L16 2" stroke="#2b3b4f" strokeWidth="1.5" />
        </pattern>
      </defs>
      <rect width="400" height="16" fill="#111c29" />
      <rect width="400" height="16" fill="url(#truss)" />
      <rect width="400" height="2" fill="#3a4d63" />
      <rect y="14" width="400" height="2" fill="#3a4d63" />
    </svg>
  );
}

// A stage lamp hanging from the truss: cord, can, and the glowing lens.
function Lamp({ big = false, off = false, className = "" }: { big?: boolean; off?: boolean; className?: string }) {
  const w = big ? 64 : 40;
  const h = big ? 74 : 44;
  return (
    <svg aria-hidden width={w} height={h} viewBox="0 0 64 74" className={`z-20 ${className}`}>
      <defs>
        <radialGradient id={big ? "lens-big" : "lens"} cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#fffbe8" />
          <stop offset="0.5" stopColor="#ffe7a8" />
          <stop offset="1" stopColor="#f2b84b" />
        </radialGradient>
      </defs>
      {big && <rect x="31" y="0" width="2" height="20" fill="#3a4d63" />}
      <path d="M14 22 Q32 14 50 22 L56 54 Q32 62 8 54 Z" fill="#1d2a3a" stroke="#4a6078" strokeWidth="1.5" />
      <path d="M20 26 Q32 21 44 26" stroke="#5f7894" strokeWidth="1.5" fill="none" />
      <ellipse cx="32" cy="55" rx="22" ry="6" fill={off ? "#2a3646" : `url(#${big ? "lens-big" : "lens"})`} />
      {!off && <ellipse cx="32" cy="57" rx="28" ry="9" fill="#ffe7a8" opacity="0.35" />}
    </svg>
  );
}
