import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BuyCredits } from "@/components/Earn";
import { CREDITS, CREDIT_REASONS, SPOTLIGHT, STREAK_BONUS } from "@/lib/constants";
import { getCreditHistory, getViewer } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { Coin } from "@/components/Coin";

export const metadata: Metadata = { title: "V Coin credits" };

export default async function CreditsPage({ searchParams }: PageProps<"/credits">) {
  const params = await searchParams;
  const viewer = await getViewer();
  if (isSupabaseConfigured && !viewer) redirect("/login?next=/credits");
  const history = viewer ? await getCreditHistory(viewer) : [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="display rise text-6xl">Credits</h1>
      <p className="mt-1 text-muted">
        Credits on Method V are called <span className="font-semibold text-ink">V Coin</span>. Earn them by testing apps, or buy a pack.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-5">
        <div>
          <p className="text-sm text-muted">Your V Coin</p>
          <p className="font-mono text-5xl font-bold">
            <Coin />
            {viewer?.credits ?? 0}
          </p>
        </div>
        <Link href="/test" className="btn-accent">
          Earn more in Test &amp; earn
        </Link>
      </div>

      {params.paid && (
        <p className="mt-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
          Thanks! Your V Coin is on its way; it shows up here in a few seconds.
        </p>
      )}

      <section id="buy" aria-label="Buy V Coin" className="mt-10 scroll-mt-24">
        <h2 className="display text-4xl">Buy V Coin</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          For the Spotlight (<Coin />{SPOTLIGHT.cost}) or testers for your app. Or earn them free by testing apps. V Coin can&apos;t be
          turned back into money.
        </p>
        <BuyCredits />
      </section>

      <h2 className="display mt-10 text-4xl">How V Coin works</h2>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ink/90">
        <li>• Everyone starts with <Coin />{CREDITS.welcome}.</li>
        <li>
          • Try an app in <Link href="/test" className="text-accent hover:underline">Test &amp; earn</Link> and give feedback:
          earn <Coin />{CREDITS.feedbackReward}.
        </li>
        <li>• When a builder marks your feedback helpful: +<Coin />{CREDITS.helpfulBonus}.</li>
        <li>• Spend <Coin />{CREDITS.perTester} per tester to put your own app in the queue. Unused spots are refunded if you stop.</li>
        <li>• You can earn from up to {CREDITS.dailyPaidFeedback} feedbacks a day, so the queue stays fair.</li>
        <li>
          • Tester Passport perks: Testers earn <Coin />3 per paid feedback, Pro Testers can earn from 20 a day, and{" "}
          {STREAK_BONUS.weeks} weeks in a row earns a <Coin />{STREAK_BONUS.credits} bonus.
        </li>
        <li>
          • Book the Spotlight: one of {SPOTLIGHT.slots} spots in the Featured row for {SPOTLIGHT.days} days, <Coin />{SPOTLIGHT.cost}{" "}
          (<Coin />{SPOTLIGHT.proCost} with Pro). First come, first served.
        </li>
      </ul>

      {!isSupabaseConfigured && <p className="mt-6 text-sm text-muted">V Coin is off in demo mode.</p>}

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
