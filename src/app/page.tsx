import Link from "next/link";

import { AppCard } from "@/components/AppCard";
import { Avatar } from "@/components/Avatar";
import { Countdown } from "@/components/Countdown";
import { challengePhase } from "@/components/ChallengeCard";
import { FeaturedCard } from "@/components/FeaturedCard";
import { Suggestions } from "@/components/Suggestions";
import { Updates } from "@/components/Updates";
import { CATEGORIES, CREDITS, isOneOf } from "@/lib/constants";
import {
  getApps,
  getChallenges,
  getFeatured,
  getJobs,
  getMyApps,
  getSuggestions,
  getTestQueue,
  getUpcomingLaunches,
  getUpdates,
  getViewer,
  nowMs,
} from "@/lib/data";

// The home feed: Featured up top, then everybody's projects.

const SORTS = [
  { slug: "latest", label: "Latest" },
  { slug: "popular", label: "Popular" },
] as const;

function homeHref(sort: string, category?: string) {
  const params = new URLSearchParams();
  if (sort !== "latest") params.set("sort", sort);
  if (category) params.set("category", category);
  const qs = params.toString();
  return qs ? `/?${qs}#projects` : "/#projects";
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const sort = params.sort === "popular" ? "popular" : "latest";
  const category = isOneOf(CATEGORIES, params.category) ? params.category : undefined;

  const viewer = await getViewer();
  const [featured, apps, queue, upcoming, followingUpdates, myApps, suggestions, challenges, jobs] = await Promise.all([
    getFeatured(),
    getApps({ category, sort: sort === "popular" ? "tried" : undefined }),
    getTestQueue(viewer),
    getUpcomingLaunches(),
    viewer ? getUpdates({ following: viewer, limit: 5 }) : Promise.resolve([]),
    getMyApps(viewer),
    getSuggestions(viewer),
    getChallenges(),
    getJobs({}),
  ]);
  const now = nowMs();
  const challenge = challenges.find((c) => challengePhase(c, now) === "open");
  // Signed-in people see updates from who they follow; otherwise (or if that's empty) everyone's.
  const updates = followingUpdates.length > 0 ? followingUpdates : await getUpdates({ limit: 5 });

  return (
    <div className="mx-auto w-full max-w-6xl py-6">
      <header className="flex items-end justify-between gap-3 px-4">
        <div>
          <p className="font-mono text-[11px] tracking-widest text-accent uppercase">What builders shipped</p>
          <h1 className="display rise mt-1 text-6xl sm:text-7xl">{featured.curated ? "Featured" : "Hot right now"}</h1>
        </div>
        <Link href="/browse" className="btn-ghost shrink-0 px-3" aria-label="Search apps">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <span className="hidden sm:inline">Search</span>
        </Link>
      </header>

      {featured.apps.length > 0 ? (
        <section aria-label="Featured apps" className="no-scrollbar mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2">
          {featured.apps.map((app, i) => (
            <FeaturedCard key={app.id} app={app} rank={i} />
          ))}
        </section>
      ) : (
        <p className="mt-4 px-4 text-muted">Nothing featured yet. Post a Drop and be the first.</p>
      )}

      {upcoming.length > 0 && (
        <section aria-label="Upcoming launches" className="mt-8 px-4">
          <h2 className="display text-3xl">Launching soon</h2>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
            {upcoming.map((app) => (
              <li key={app.id}>
                <Link href={`/apps/${app.slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <Avatar username={app.owner.username} name={app.owner.display_name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="display block truncate text-2xl">{app.name}</span>
                    <span className="block truncate text-xs text-muted">{app.tagline}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-mono text-[10px] tracking-wide text-muted uppercase">Launches in</span>
                    <Countdown to={app.launch_at!} className="font-mono text-sm font-bold text-accent" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Build in public" className="mt-8 px-4">
        <h2 className="display text-3xl">Build in public</h2>
        <p className="mt-1 text-sm text-muted">
          {followingUpdates.length > 0 ? "From you and the builders you follow." : "What builders are shipping, as it happens."}
        </p>
        <div className="mt-3">
          <Updates
            updates={updates}
            viewerId={viewer?.id ?? null}
            composer={viewer ? { apps: myApps } : null}
            emptyText="No updates yet. Be the first to share what you're building."
          />
        </div>
      </section>

      <Suggestions people={suggestions} signedIn={Boolean(viewer)} />

      {queue.length > 0 && (
        <Link
          href="/test"
          className="mx-4 mt-5 flex items-center justify-between gap-3 rounded-lg border border-accent/50 bg-accent/10 px-4 py-3 transition hover:bg-accent/15"
        >
          <span className="text-sm">
            <span className="font-semibold">
              {queue.length} {queue.length === 1 ? "app needs" : "apps need"} testers.
            </span>{" "}
            <span className="text-muted">Try one, earn ⚡{CREDITS.feedbackReward}.</span>
          </span>
          <span className="font-mono text-xs font-semibold text-accent">Test &amp; earn →</span>
        </Link>
      )}

      {(challenge || jobs.length > 0) && (
        <section aria-label="Get paid" className="mx-4 mt-5 grid gap-2 sm:grid-cols-2">
          {challenge && (
            <Link
              href={`/challenges/${challenge.slug}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 transition hover:border-accent"
            >
              <span className="min-w-0 text-sm">
                <span className="block truncate font-semibold">🏆 {challenge.title}</span>
                <span className="block truncate text-muted">{challenge.prize}</span>
              </span>
              <span className="shrink-0 font-mono text-xs font-semibold text-accent">Enter →</span>
            </Link>
          )}
          {jobs.length > 0 && (
            <Link
              href="/jobs"
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 transition hover:border-accent"
            >
              <span className="min-w-0 text-sm">
                <span className="block font-semibold">
                  {jobs.length} open {jobs.length === 1 ? "post" : "posts"} on the jobs board
                </span>
                <span className="block truncate text-muted">Jobs, gigs and builders looking for work</span>
              </span>
              <span className="shrink-0 font-mono text-xs font-semibold text-accent">Jobs →</span>
            </Link>
          )}
        </section>
      )}

      <section id="projects" className="mt-10 scroll-mt-20 px-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="display text-5xl">All projects</h2>
          <nav aria-label="Sort" className="flex gap-4">
            {SORTS.map((s) => (
              <Link
                key={s.slug}
                href={homeHref(s.slug, category)}
                aria-current={s.slug === sort ? "page" : undefined}
                className={`display pb-1 text-2xl transition ${
                  s.slug === sort ? "text-ink shadow-[inset_0_-3px_0_var(--color-accent)]" : "text-muted hover:text-ink"
                }`}
              >
                {s.label}
              </Link>
            ))}
          </nav>
        </div>

        <nav aria-label="Categories" className="no-scrollbar -mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          <CategoryLink href={homeHref(sort)} active={!category} label="All" />
          {CATEGORIES.map((c) => (
            <CategoryLink key={c.slug} href={homeHref(sort, c.slug)} active={category === c.slug} label={c.label} />
          ))}
        </nav>

        {apps.length > 0 ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((app, i) => (
              <AppCard key={app.id} app={app} index={i} />
            ))}
          </div>
        ) : (
          <div className="mt-12 flex flex-col items-center gap-3 text-center">
            <p className="text-lg font-semibold">No projects here yet.</p>
            <Link href="/submit" className="btn-accent">
              Post yours
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function CategoryLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 rounded-md border px-2.5 py-1.5 font-mono text-[11px] font-medium tracking-wide uppercase ${
        active ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-muted hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}
