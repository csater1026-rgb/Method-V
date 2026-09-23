import Link from "next/link";

import { DropFeed } from "@/components/DropFeed";
import { CATEGORIES, isOneOf } from "@/lib/constants";
import { getFeed, getViewer, type FeedTab } from "@/lib/data";

const TABS: { slug: FeedTab; label: string }[] = [
  { slug: "new", label: "New" },
  { slug: "trending", label: "Trending" },
  { slug: "following", label: "Following" },
];

function feedHref(tab: FeedTab, category?: string) {
  const params = new URLSearchParams();
  if (tab !== "new") params.set("tab", tab);
  if (category) params.set("category", category);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export default async function DropsPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const tab: FeedTab = TABS.some((t) => t.slug === params.tab) ? (params.tab as FeedTab) : "new";
  const category = isOneOf(CATEGORIES, params.category) ? params.category : undefined;

  const [items, viewer] = await Promise.all([getFeed({ tab, category }), getViewer()]);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 p-3">
        <nav aria-label="Feed" className="pointer-events-auto flex gap-1 rounded-full bg-black/60 p-1 backdrop-blur">
          {TABS.map((t) => (
            <Link
              key={t.slug}
              href={feedHref(t.slug, category)}
              aria-current={t.slug === tab ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                t.slug === tab ? "bg-ink text-bg" : "text-ink/80 hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <nav
          aria-label="Categories"
          className="no-scrollbar pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto px-1"
        >
          <CategoryLink href={feedHref(tab)} active={!category} label="All" />
          {CATEGORIES.map((c) => (
            <CategoryLink key={c.slug} href={feedHref(tab, c.slug)} active={category === c.slug} label={c.label} />
          ))}
        </nav>
      </div>

      {items.length > 0 ? (
        <DropFeed items={items} signedIn={Boolean(viewer)} />
      ) : (
        <EmptyFeed tab={tab} signedIn={Boolean(viewer)} filtered={Boolean(category)} />
      )}
    </div>
  );
}

function CategoryLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium backdrop-blur ${
        active ? "bg-accent text-accent-ink" : "bg-black/50 text-ink/80 hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}

function EmptyFeed({ tab, signedIn, filtered }: { tab: FeedTab; signedIn: boolean; filtered: boolean }) {
  let title = "No Drops yet";
  let body = "Be the first to post a 60-second demo of what you built.";
  let action = { href: "/submit", label: "Post a Drop" };

  if (tab === "following" && !signedIn) {
    title = "Follow builders you like";
    body = "Sign in to see Drops from the people you follow.";
    action = { href: "/login?next=%2F%3Ftab%3Dfollowing", label: "Sign in" };
  } else if (tab === "following") {
    title = "Nothing here yet";
    body = "Follow builders from their profiles and their new Drops show up here.";
    action = { href: "/browse", label: "Find builders" };
  } else if (filtered) {
    title = "No Drops in this category yet";
  }

  return (
    <div className="flex h-[calc(100dvh-var(--chrome)-var(--tabbar))] flex-col items-center justify-center gap-3 px-6 pt-24 text-center">
      <h1 className="text-2xl font-black">{title}</h1>
      <p className="max-w-sm text-muted">{body}</p>
      <Link href={action.href} className="btn-accent mt-2">
        {action.label}
      </Link>
    </div>
  );
}
