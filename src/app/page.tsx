import Link from "next/link";

import { AppCard } from "@/components/AppCard";
import { Avatar } from "@/components/Avatar";
import { Countdown } from "@/components/Countdown";
import { FeaturedCard } from "@/components/FeaturedCard";
import { CATEGORIES, CREDITS, isOneOf } from "@/lib/constants";
import { getApps, getFeatured, getTestQueue, getUpcomingLaunches, getViewer } from "@/lib/data";

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
  const [featured, apps, queue, upcoming] = await Promise.all([
    getFeatured(),
    getApps({ category, sort: sort === "popular" ? "tried" : undefined }),
    getTestQueue(viewer),
    getUpcomingLaunches(),
  ]);

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
