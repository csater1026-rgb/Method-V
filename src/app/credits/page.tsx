import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { headers } from "next/headers";

import { BountyList } from "@/components/Bounties";
import { BuyCredits } from "@/components/Earn";
import { InviteCard } from "@/components/InviteCard";
import { PerkList } from "@/components/Perks";
import { BOUNTIES, CREDITS, CREDIT_REASONS, REFERRALS, SPOTLIGHT, STREAK_BONUS, TIPS } from "@/lib/constants";
import { getCreditHistory, getMyInvites, getOpenBounties, getPerkListings, getViewer } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { Coin } from "@/components/Coin";

export const metadata: Metadata = { title: "Methodium" };

export default async function CreditsPage({ searchParams }: PageProps<"/credits">) {
  const params = await searchParams;
  const viewer = await getViewer();
  if (isSupabaseConfigured && !viewer) redirect("/login?next=/credits");
  const [history, bounties, perks, invites] = await Promise.all([
    viewer ? getCreditHistory(viewer) : Promise.resolve([]),
    getOpenBounties(viewer, 6),
    getPerkListings(viewer, 6),
    getMyInvites(viewer),
  ]);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "methodv.app";
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? `${host.startsWith("localhost") ? "http" : "https"}://${host}`).replace(/\/$/, "");
  const inviteLink = `${origin}/?ref=${viewer?.username ?? "you"}`;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="display rise text-6xl">Credits</h1>
      <p className="mt-1 text-muted">
        Credits on Method V are called <span className="font-semibold text-ink">Methodium (Mv)</span>, a made-up element (it used to be called V Coin). Earn it by answering bounties, or buy a pack.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-5">
        <div>
          <p className="text-sm text-muted">Your Methodium</p>
          <p className="font-mono text-5xl font-bold">
            <Coin />
            {viewer?.credits ?? 0}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/store" className="btn-accent">
            Spend it in the V Store
          </Link>
          <Link href="/test" className="btn-ghost">
            Earn more in Test &amp; earn
          </Link>
        </div>
      </div>

      {params.paid && (
        <p className="mt-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
          Thanks! Your Methodium is on its way; it shows up here in a few seconds.
        </p>
      )}

      {invites && (
        <div className="mt-8">
          <InviteCard link={inviteLink} joined={invites.joined} rewarded={invites.rewarded} />
        </div>
      )}

      <section id="bounties" aria-labelledby="bounties-title" className="mt-10 scroll-mt-24">
        <h2 id="bounties-title" className="display text-4xl">
          Bounties: earn bigger
        </h2>
        <p className="mt-1 text-sm text-muted">
          Builders pay Methodium for a specific job: find a bug, record a first try, review a page. The best answer gets the whole reward; if the
          builder doesn&apos;t pick one in time, everyone who answered splits it.
        </p>
        {bounties.length > 0 ? (
          <BountyList bounties={bounties} />
        ) : (
          <p className="mt-3 text-sm text-muted">No open bounties right now. Builders post them from their app&apos;s page.</p>
        )}
      </section>

      <section id="perks" aria-labelledby="perks-title" className="mt-10 scroll-mt-24">
        <h2 id="perks-title" className="display text-4xl">
          Perks: spend it on real deals
        </h2>
        <p className="mt-1 text-sm text-muted">
          Builders offer deals on their apps (free months, lifetime deals, promo codes) that you unlock with Methodium.
        </p>
        {perks.length > 0 ? (
          <PerkList perks={perks} />
        ) : (
          <p className="mt-3 text-sm text-muted">No perks on offer right now. Builders add them from their app&apos;s page.</p>
        )}
      </section>

      <section id="buy" aria-label="Buy Methodium" className="mt-10 scroll-mt-24">
        <h2 className="display text-4xl">Buy Methodium</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          For the V Store (Pro, extra app posts, the Spotlight at <Coin />{SPOTLIGHT.cost}) or bounties on your app. Or earn it free by
          answering bounties. Methodium can&apos;t be turned back into money.
        </p>
        <BuyCredits />
      </section>

      <h2 className="display mt-10 text-4xl">How Methodium works</h2>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ink/90">
        <li>• Everyone starts with <Coin />{CREDITS.welcome}.</li>
        <li>
          • Answer a <a href="#bounties" className="text-accent hover:underline">bounty</a> in{" "}
          <Link href="/test" className="text-accent hover:underline">
            Test &amp; earn
          </Link>
          : rewards of <Coin />
          {BOUNTIES.minReward} to <Coin />
          {BOUNTIES.maxReward}, set by the builder. The best answer gets it; if the builder doesn&apos;t pick, everyone who answered
          splits it.
        </li>
        <li>
          • Want people to try your app? Post a bounty from its page. Only someone who actually does the job gets paid, and if nobody
          answers you get it all back. (You can&apos;t buy testers: nobody can promise someone will test your app.)
        </li>
        <li>• Give feedback on any app for free. When the builder marks it helpful: +<Coin />{CREDITS.helpfulBonus}.</li>
        <li>
          • Give feedback {STREAK_BONUS.weeks} weeks in a row: a <Coin />
          {STREAK_BONUS.credits} bonus.
        </li>
        <li>
          • Invite friends: you both get <Coin />
          {REFERRALS.bonus} when they post their first Drop or earn their first bounty reward.
        </li>
        <li>
          • Tip a builder you love or a tester who helped: up to <Coin />
          {TIPS.perDay} a day, once your account is a week old.
        </li>
        <li>
          • Unlock <a href="#perks" className="text-accent hover:underline">perks</a>: deals on apps, paid to their builders in Methodium (once
          your account is a week old).
        </li>
        <li>
          • Book the Spotlight: one of {SPOTLIGHT.slots} spots in the Featured row for {SPOTLIGHT.days} days, <Coin />{SPOTLIGHT.cost}{" "}
          (<Coin />{SPOTLIGHT.proCost} with Pro). First come, first served.
        </li>
      </ul>

      {!isSupabaseConfigured && <p className="mt-6 text-sm text-muted">Methodium is off in demo mode.</p>}

      {viewer && (
        <>
          <h2 className="display mt-10 text-4xl">History</h2>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
              {history.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{CREDIT_REASONS[e.reason] ?? e.reason}</p>
                    <p className="truncate text-xs text-muted">
                      {e.app && (
                        <>
                          <Link href={`/apps/${e.app.slug}`} className="hover:text-ink">
                            {e.app.name}
                          </Link>{" "}
                          ·{" "}
                        </>
                      )}
                      {timeAgo(e.created_at)}
                    </p>
                  </div>
                  <span className={`font-mono font-semibold ${e.delta > 0 ? "text-accent" : "text-muted"}`}>
                    {e.delta > 0 ? "+" : ""}
                    {e.delta}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
