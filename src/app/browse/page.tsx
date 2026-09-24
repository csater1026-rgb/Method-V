import type { Metadata } from "next";
import Link from "next/link";

import { AppCard } from "@/components/AppCard";
import { UpcomingLaunches } from "@/components/UpcomingLaunches";
import { CATEGORIES, PRICING, STAGES } from "@/lib/constants";
import { getApps, getUpcomingLaunches, type BrowseFilters } from "@/lib/data";

export const metadata: Metadata = { title: "Browse apps" };

const POPULAR_STACKS = ["Next.js", "React", "Supabase", "Lovable", "Bolt", "Replit", "v0", "Vite", "Stripe", "Claude"];

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BrowsePage({ searchParams }: PageProps<"/browse">) {
  const params = await searchParams;
  const filters: BrowseFilters = {
    q: one(params.q),
    category: one(params.category),
    stack: one(params.stack),
    pricing: one(params.pricing),
    stage: one(params.stage),
    sort: one(params.sort),
  };
  const hasFilters = Object.entries(filters).some(([k, v]) => v && k !== "sort");
  const [apps, upcoming] = await Promise.all([getApps(filters), hasFilters ? Promise.resolve([]) : getUpcomingLaunches()]);

  const categoryHref = (slug?: string) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v && k !== "category") next.set(k, v);
    if (slug) next.set("category", slug);
    const qs = next.toString();
    return qs ? `/browse?${qs}` : "/browse";
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="display rise text-6xl sm:text-7xl">Browse apps</h1>
      <p className="mt-1 text-muted">Every app here has a live link and a 60-second Drop.</p>

      <nav aria-label="Categories" className="no-scrollbar mt-6 flex gap-1.5 overflow-x-auto pb-1">
        <CategoryTab href={categoryHref()} active={!filters.category} label="All" />
        {CATEGORIES.map((c) => (
          <CategoryTab key={c.slug} href={categoryHref(c.slug)} active={filters.category === c.slug} label={c.label} />
        ))}
      </nav>

      <form className="mt-4 grid gap-2 sm:grid-cols-[1fr_repeat(4,auto)_auto]" role="search">
        {filters.category && <input type="hidden" name="category" value={filters.category} />}
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="Search apps…"
          aria-label="Search apps"
          className="field"
        />
        <input
          name="stack"
          defaultValue={filters.stack}
          placeholder="Tech stack"
          aria-label="Tech stack"
          list="stacks"
          className="field sm:w-36"
        />
        <datalist id="stacks">
          {POPULAR_STACKS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <select name="pricing" defaultValue={filters.pricing ?? ""} aria-label="Pricing" className="field sm:w-32">
          <option value="">Any price</option>
          {PRICING.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.label}
            </option>
          ))}
        </select>
        <select name="stage" defaultValue={filters.stage ?? ""} aria-label="Stage" className="field sm:w-32">
          <option value="">Any stage</option>
          {STAGES.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.label}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={filters.sort ?? ""} aria-label="Sort" className="field sm:w-36">
          <option value="">Newest</option>
          <option value="tried">Most tried</option>
        </select>
        <button className="btn-accent">Apply</button>
      </form>

      <UpcomingLaunches apps={upcoming} />

      {hasFilters && (
        <p className="mt-3 text-sm text-muted">
          {apps.length} {apps.length === 1 ? "app" : "apps"} ·{" "}
          <Link href="/browse" className="underline hover:text-ink">
            Clear filters
          </Link>
        </p>
      )}

      {apps.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app, i) => (
            <AppCard key={app.id} app={app} index={i} />
          ))}
        </div>
      ) : (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <p className="text-lg font-semibold">No apps match yet.</p>
          <Link href="/submit" className="btn-accent">
            Post yours
          </Link>
        </div>
      )}
    </div>
  );
}

function CategoryTab({ href, active, label }: { href: string; active: boolean; label: string }) {
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
