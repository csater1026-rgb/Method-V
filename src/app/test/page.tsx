import type { Metadata } from "next";
import Link from "next/link";

import { AppCard } from "@/components/AppCard";
import { BountyList } from "@/components/Bounties";
import { Coin } from "@/components/Coin";
import { TopTesters } from "@/components/Passport";
import { BOUNTIES, CREDITS, STREAK_BONUS } from "@/lib/constants";
import { getApps, getOpenBounties, getTopTesters, getViewer, settleBounties } from "@/lib/data";

export const metadata: Metadata = {
  title: "Test & earn",
  description: "Earn Methodium by doing real jobs for builders (bounties), and give free feedback on new apps.",
};

// Test & earn: bounties are how testers earn (a builder pays a set reward
// for a specific job, and only someone who did it gets paid). Below them,
// the newest apps to try and give free feedback on. Nobody pays for testers.
export default async function TestPage() {
  const viewer = await getViewer();
  await settleBounties();
  const [bounties, newest, topTesters] = await Promise.all([getOpenBounties(12), getApps({}, 6), getTopTesters()]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="display rise text-6xl sm:text-7xl">Test &amp; earn</h1>
      <p className="mt-1 max-w-2xl text-muted">
        Builders post bounties: a Methodium reward for a specific job, like trying their signup flow or finding a bug. Do the job, and the
        best answer gets paid.
      </p>

      <ol className="mt-6 grid gap-3 sm:grid-cols-3">
        <Step n={1} title="Pick a bounty">
          Each one says exactly what the builder wants and what it pays ({BOUNTIES.minReward} to {BOUNTIES.maxReward} Methodium).
        </Step>
        <Step n={2} title="Do the job">
          Try the app, find the bug, record the first try. Then send your answer; only the builder sees it.
        </Step>
        <Step
          n={3}
          title={
            <>
              Get <Coin />
              paid
            </>
          }
        >
          The builder picks the best answer. If they don&apos;t pick by the deadline, everyone who answered splits the reward.
        </Step>
      </ol>

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-4xl">Open bounties</h2>
        {viewer ? (
          <Link href="/credits" className="text-sm text-muted hover:text-ink">
            You have{" "}
            <span className="font-semibold text-ink">
              <Coin />
              {viewer.credits}
            </span>{" "}
            · history
          </Link>
        ) : (
          <Link href="/login?next=/test" className="text-sm text-accent hover:underline">
            Sign in to earn Methodium
          </Link>
        )}
      </div>
      {bounties.length > 0 ? (
        <div className="max-w-3xl">
          <BountyList bounties={bounties} />
        </div>
      ) : (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-line bg-surface p-8 text-center">
          <p className="text-lg font-semibold">No open bounties right now.</p>
          <p className="max-w-md text-muted">
            Want people to try your app? Post a bounty from your app&apos;s page. Only someone who actually does the job gets paid, and if
            nobody answers you get it all back.
          </p>
          <Link href={viewer ? `/u/${viewer.username}` : "/submit"} className="btn-accent">
            {viewer ? "Go to your apps" : "Post a Drop"}
          </Link>
        </div>
      )}

      {newest.length > 0 && (
        <section aria-labelledby="feedback-title" className="mt-12">
          <h2 id="feedback-title" className="display text-4xl">
            Give feedback
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            New apps to try. Feedback is free and private to the builder. If they mark yours helpful you earn <Coin />
            {CREDITS.helpfulBonus}, and giving feedback {STREAK_BONUS.weeks} weeks in a row earns <Coin />
            {STREAK_BONUS.credits}.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {newest.map((app, i) => (
              <div key={app.id} className="flex flex-col gap-2">
                <AppCard app={app} index={i} />
                <Link href={`/apps/${app.slug}#feedback`} className="btn-ghost self-end px-3 py-1.5 text-sm">
                  Give feedback →
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-12">
        <TopTesters testers={topTesters} />
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="rise rounded-xl border border-line bg-surface p-4" style={{ "--i": n } as React.CSSProperties}>
      <span className="font-mono text-xs text-accent">0{n} /</span>
      <h3 className="display mt-2 text-3xl">{title}</h3>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </li>
  );
}
