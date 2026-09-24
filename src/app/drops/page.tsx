import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { DropFeed } from "@/components/DropFeed";
import { QuestionFeed } from "@/components/QuestionFeed";
import { getFeed, getQuestionFeed, getViewer, type FeedTab } from "@/lib/data";
import { INTERESTS_COOKIE, parseInterests } from "@/lib/interests";

export const metadata: Metadata = { title: "Drops" };

type Tab = FeedTab | "questions";

const TABS: { slug: Tab; label: string }[] = [
  { slug: "foryou", label: "For you" },
  { slug: "trending", label: "Trending" },
  { slug: "following", label: "Following" },
  { slug: "questions", label: "Questions" },
];

function feedHref(tab: Tab) {
  return tab === "foryou" ? "/drops" : `/drops?tab=${tab}`;
}

export default async function DropsPage({ searchParams }: PageProps<"/drops">) {
  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.slug === params.tab) ? (params.tab as Tab) : "foryou";
  // What this browser has learned this person likes (see DropFeed).
  const interests = parseInterests((await cookies()).get(INTERESTS_COOKIE)?.value);

  const viewer = await getViewer();
  const [items, questions] = await Promise.all([
    tab === "questions" ? Promise.resolve([]) : getFeed({ tab, interests }),
    tab === "questions" ? getQuestionFeed(viewer, interests) : Promise.resolve([]),
  ]);

  return (
    <div className="relative">
      <div className="media-dark pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-2 p-3">
        <nav aria-label="Feed" className="pointer-events-auto flex gap-3 drop-shadow-[0_1px_6px_rgb(0_0_0/0.7)] sm:gap-4">
          {TABS.map((t) => (
            <Link
              key={t.slug}
              href={feedHref(t.slug)}
              aria-current={t.slug === tab ? "page" : undefined}
              className={`display px-0.5 pb-1 text-[19px] transition sm:text-[22px] ${
                t.slug === tab ? "text-ink shadow-[inset_0_-3px_0_var(--color-accent)]" : "text-ink/55 hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {tab === "questions" ? (
        <QuestionFeed items={questions} signedIn={Boolean(viewer)} />
      ) : items.length > 0 ? (
        <DropFeed items={items} signedIn={Boolean(viewer)} />
      ) : (
        <EmptyFeed tab={tab} signedIn={Boolean(viewer)} />
      )}
    </div>
  );
}

function EmptyFeed({ tab, signedIn }: { tab: Tab; signedIn: boolean }) {
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
