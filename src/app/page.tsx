import Link from "next/link";

import { FeaturedCard } from "@/components/FeaturedCard";
import { Suggestions } from "@/components/Suggestions";
import { getFeatured, getSuggestions, getViewer } from "@/lib/data";

// Home: just Featured and builders to follow. Everything else lives on Browse.

export default async function HomePage() {
  const viewer = await getViewer();
  const [featured, suggestions] = await Promise.all([getFeatured(), getSuggestions(viewer)]);

  return (
    <div className="mx-auto w-full max-w-6xl py-6">
      <header className="flex items-center justify-between gap-3 px-4">
        <h1 className="display text-3xl">{featured.curated ? "Featured" : "Hot right now"}</h1>
        <Link href="/browse" className="btn-ghost shrink-0 px-3" aria-label="Search apps">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <span className="hidden sm:inline">Search</span>
        </Link>
      </header>

      {featured.apps.length > 0 ? (
        <section aria-label="Featured apps" className="no-scrollbar mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2">
          {featured.apps.map((app, i) => (
            <FeaturedCard key={app.id} app={app} rank={i} />
          ))}
        </section>
      ) : (
        <p className="mt-4 px-4 text-muted">Nothing featured yet. Post a Drop and be the first.</p>
      )}

      {suggestions.length > 0 ? (
        <Suggestions people={suggestions} signedIn={Boolean(viewer)} />
      ) : (
        !viewer && (
          <section aria-label="Builders like you" className="mx-4 mt-8 rounded-xl border border-line bg-surface p-4">
            <h2 className="display text-3xl">Builders like you</h2>
            <p className="mt-1 text-sm text-muted">Sign in and we&apos;ll suggest builders to follow, based on what you build and like.</p>
            <Link href="/login" className="btn-accent mt-3">
              Sign in
            </Link>
          </section>
        )
      )}
    </div>
  );
}
