import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { DropFeed } from "@/components/DropFeed";
import { getFeed, getViewer, type FeedTab } from "@/lib/data";
import { INTERESTS_COOKIE, parseInterests } from "@/lib/interests";

export const metadata: Metadata = { title: "Drops" };

const TABS: { slug: FeedTab; label: string }[] = [
  { slug: "foryou", label: "For you" },
  { slug: "trending", label: "Trending" },
  { slug: "following", label: "Following" },
];

function feedHref(tab: FeedTab) {
  return tab === "foryou" ? "/drops" : `/drops?tab=${tab}`;
}

export default async function DropsPage({ searchParams }: PageProps<"/drops">) {
  const params = await searchParams;
  const tab: FeedTab = TABS.some((t) => t.slug === params.tab) ? (params.tab as FeedTab) : "foryou";
  // What this browser has learned this person likes (see DropFeed).
  const interests = parseInterests((await cookies()).get(INTERESTS_COOKIE)?.value);

  const [items, viewer] = await Promise.all([getFeed({ tab, interests }), getViewer()]);

  return (
    <div className="relative">
      <div className="media-dark pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 p-3">
        <nav aria-label="Feed" className="pointer-events-auto flex gap-4 drop-shadow-[0_1px_6px_rgb(0_0_0/0.7)]">
          {TABS.map((t) => (
            <Link
              key={t.slug}
              href={feedHref(t.slug)}
              aria-current={t.slug === tab ? "page" : undefined}
              className={`display px-0.5 pb-1 text-[22px] transition ${
                t.slug === tab ? "text-ink shadow-[inset_0_-3px_0_var(--color-accent)]" : "text-ink/55 hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {items.length > 0 ? (
        <DropFeed items={items} signedIn={Boolean(viewer)} />
      ) : (
        <EmptyFeed tab={tab} signedIn={Boolean(viewer)} />
      )}
    </div>
  );
}

function EmptyFeed({ tab, signedIn }: { tab: FeedTab; signedIn: boolean }) {
  let title = "No Drops yet";
  let body = "Be the first to post a 60-second demo of what you built.";
  let action = { href: "/submit", label: "Post a Drop" };

  if (tab === "following" && !signedIn) {
    title = "Follow builders you like";
    body = "Sign in to see Drops from the people you follow.";
    action = { href: "/login?next=%2Fdrops%3Ftab%3Dfollowing", label: "Sign in" };
  } else if (tab === "following") {
    title = "Nothing here yet";
    body = "Follow builders from their profiles and their new Drops show up here.";
    action = { href: "/browse", label: "Find builders" };
  }

  return (
    <div className="flex h-[calc(100dvh-var(--chrome)-var(--tabbar))] flex-col items-center justify-center gap-3 px-6 pt-24 text-center">
      <h1 className="display text-5xl">{title}</h1>
      <p className="max-w-sm text-muted">{body}</p>
      <Link href={action.href} className="btn-accent mt-2">
        {action.label}
      </Link>
    </div>
  );
}
