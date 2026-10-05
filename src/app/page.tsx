import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ChallengeBanner } from "@/components/ChallengeBanner";
import { DropBonusPopup } from "@/components/DropBonusPopup";
import { FeaturedCard } from "@/components/FeaturedCard";
import { SpotlightStage } from "@/components/SpotlightStage";
import { STAGE_SPOTS } from "@/lib/spotlight-stage";
import { LEADERBOARD_PRIZES } from "@/lib/constants";
import { Suggestions } from "@/components/Suggestions";
import { getApps, getFeatured, getMyApps, getPromotion, getRunningChallenge, getSuggestions, getViewer, settleLeaderboards } from "@/lib/data";
import { PROFILE_LATER_COOKIE, isDefaultUsername } from "@/lib/username";

// Home: a running challenge (only while one is on), a nudge to show off your
// app (or to get more eyes on it), the Spotlight, builders to follow, the
// newest projects, then a link to the monthly leaderboards. Everything else
// (the leaderboards included) lives on Browse.

export default async function HomePage() {
  const viewer = await getViewer();
  // First sign-in: pick a username before the tour (unless they skipped it).
  if (viewer && isDefaultUsername(viewer.username) && !(await cookies()).get(PROFILE_LATER_COOKIE)) redirect("/welcome");
  const [challenge, featured, suggestions, newest, myApps] = await Promise.all([
    getRunningChallenge(),
    getFeatured(),
    getSuggestions(viewer),
    getApps({}, 10),
    getMyApps(viewer),
    // The busiest page, so a new month's first visit pays last month's prizes.
    settleLeaderboards(),
  ]);
  const latestApp = myApps[0];
  const dropBonus = await getPromotion("drop_bonus");

  return (
    <div className="mx-auto w-full max-w-6xl py-6">
      {challenge && (
        <div className="mb-6">
          <ChallengeBanner challenge={challenge} />
        </div>
      )}
      <DropBonusPopup promo={dropBonus} userId={viewer?.id ?? null} />

      <header className="flex items-center justify-between gap-3 px-4">
        <div>
          <h1 className="display text-3xl">{featured.curated ? "In the Spotlight" : "Hot right now"}</h1>
          {featured.curated && (
            <p className="text-xs text-muted">
              Featured on Method V.{" "}
              <Link href={latestApp ? `/apps/${latestApp.slug}#spotlight` : "/submit"} className="text-accent hover:underline">
                Get your app here →
              </Link>
            </p>
          )}
        </div>
        <Link href="/browse" className="btn-ghost shrink-0 px-3" aria-label="Search apps">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <span className="hidden sm:inline">Search</span>
        </Link>
      </header>

      {featured.curated && featured.apps.length > 0 ? (
        <>
          <SpotlightStage apps={featured.apps} bookHref={latestApp ? `/apps/${latestApp.slug}#spotlight` : "/submit"} />
          {/* More than fit on the stage (launch days, team picks). */}
          {featured.apps.length > STAGE_SPOTS && (
            <section aria-label="Also featured" className="no-scrollbar mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2">
              {featured.apps.slice(STAGE_SPOTS).map((app, i) => (
                <FeaturedCard key={app.id} app={app} rank={i} />
              ))}
            </section>
          )}
        </>
      ) : featured.apps.length > 0 ? (
        <section aria-label="Featured apps" data-tour="featured" className="no-scrollbar mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2">
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

      {newest.length > 0 && (
        <section aria-label="Just posted" className="mt-8">
          <div className="flex items-end justify-between gap-3 px-4">
            <h2 className="display text-3xl">Just posted</h2>
            <Link href="/browse" className="eyebrow hover:underline">
              See all →
            </Link>
          </div>
          <div className="no-scrollbar mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2">
            {newest.map((app, i) => (
              <FeaturedCard key={app.id} app={app} rank={i} />
            ))}
          </div>
        </section>
      )}

      {/* The leaderboards live on Browse; this just points there. */}
      <Link
        href="/browse#leaderboards"
        className="mx-4 mt-10 flex items-center justify-between gap-3 rounded-xl border border-accent/50 bg-accent/10 p-4 transition hover:border-accent"
      >
        <span className="min-w-0">
          <span className="block font-semibold">🏆 Monthly leaderboards</span>
          <span className="block text-sm text-muted">
            Top builders and top testers. 1st, 2nd and 3rd win {LEADERBOARD_PRIZES.join(", ")} Methodium when the month ends.
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-accent">See them →</span>
      </Link>
    </div>
  );
}
