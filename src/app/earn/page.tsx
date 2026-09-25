import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PayoutPanel, SponsorshipRow } from "@/components/Earn";
import { EARN, formatCents } from "@/lib/constants";
import { getEarnings, getMySponsorships, getViewer, isPro } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { settleRefunds, syncPayoutAccount } from "@/lib/payments";
import { isStripeConfigured } from "@/lib/stripe";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/server";
import type { Earnings, Sponsorship } from "@/lib/types";

export const metadata: Metadata = { title: "Earn" };

const KIND_LABEL: Record<string, string> = {
  tip: "Backer tip",
  sponsored_try: "Sponsored try",
  payout: "Cashed out",
  payout_failed: "Payout returned",
};

// A builder's money in one place: balance and payouts, Boost Exchange deals,
// and where it all came from.
export default async function EarnPage({ searchParams }: PageProps<"/earn">) {
  const params = await searchParams;
  const viewer = await getViewer();
  if (isSupabaseConfigured && !viewer) redirect("/login?next=/earn");

  let earnings: Earnings = { balance: 0, events: [], payouts: [], account: "none", pro_until: null };
  let deals: Sponsorship[] = [];
  if (viewer) {
    const admin = createAdminClient();
    if (admin) {
      // Back from Stripe onboarding: read the account now instead of waiting for the webhook.
      if (params.setup === "done") await syncPayoutAccount(admin, viewer.id);
      // Any refund that didn't go through last time gets another go.
      await settleRefunds(admin, { userId: viewer.id });
    }
    [earnings, deals] = await Promise.all([getEarnings(viewer), getMySponsorships(viewer)]);
  }

  const needsYou = deals.filter((d) => (d.status === "offered" && d.mine === "host") || (d.status === "accepted" && d.mine === "sponsor"));
  const running = deals.filter((d) => d.status === "active" || (d.status === "accepted" && d.mine === "host") || (d.status === "offered" && d.mine === "sponsor"));
  const past = deals.filter((d) => !needsYou.includes(d) && !running.includes(d));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="eyebrow">Backers · sponsors · payouts</p>
      <h1 className="display rise mt-1 text-6xl">Earn</h1>
      <p className="mt-1 text-muted">
        Fans can back your apps, and other apps can sponsor them and pay per real try. It all lands here.
      </p>

      {!isSupabaseConfigured && (
        <p className="mt-6 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          This is demo mode, so there&apos;s no money here. Open an app and tap <strong className="text-ink">Back it</strong> or{" "}
          <strong className="text-ink">Make an offer</strong> to see how it works.
        </p>
      )}
      {isSupabaseConfigured && !isStripeConfigured && (
        <p className="mt-6 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          Payments aren&apos;t switched on for this site yet, so tips, sponsorships and payouts are paused. Offers still work.
        </p>
      )}
      {params.paid && (
        <p className="mt-6 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
          Payment received. It can take a few seconds to show up here.
        </p>
      )}

      <section aria-label="Balance" className="mt-8 flex flex-wrap items-end justify-between gap-4 rounded-xl border border-line bg-surface p-5">
        <div>
          <p className="font-mono text-[11px] tracking-widest text-muted uppercase">Balance</p>
          <p className="display mt-1 text-7xl">{formatCents(earnings.balance)}</p>
        </div>
        {viewer && isStripeConfigured && <PayoutPanel balance={earnings.balance} account={earnings.account} />}
      </section>

      <p className="mt-3 text-sm">
        {isPro(earnings) ? (
          <>
            <span className="tag-accent">Pro</span> <span className="text-muted">until {new Date(earnings.pro_until!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.</span>{" "}
            <Link href="/pro" className="text-accent hover:underline">
              Your stats →
            </Link>
          </>
        ) : (
          <Link href="/pro" className="text-accent hover:underline">
            Get Pro: stats for your apps, a pinned app and a cheaper Spotlight →
          </Link>
        )}
      </p>

      <p className="mt-2 text-sm text-muted">
        Sponsoring for a company?{" "}
        <Link href="/brands/new" className="text-accent hover:underline">
          List your brand
        </Link>{" "}
        and it can make offers too.
      </p>

      <DealSection title="Needs you" empty="Nothing waiting on you." deals={needsYou} />
      <DealSection title="Running" empty="No deals running. Open an app you like and tap Make an offer." deals={running} />
      {past.length > 0 && <DealSection title="Past deals" empty="" deals={past} />}

      <section aria-label="History" className="mt-10">
        <h2 className="display text-3xl">History</h2>
        {earnings.events.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Tips and sponsored tries will show up here.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
            {earnings.events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  {KIND_LABEL[e.kind] ?? e.kind}
                  {e.app && (
                    <>
                      {" · "}
                      <Link href={`/apps/${e.app.slug}`} className="hover:underline">
                        {e.app.name}
                      </Link>
                    </>
                  )}
                  <span className="block text-xs text-muted" suppressHydrationWarning>
                    {timeAgo(e.created_at)}
                  </span>
                </span>
                <span className={`font-mono font-semibold ${e.delta_cents > 0 ? "text-accent" : ""}`}>
                  {e.delta_cents > 0 ? "+" : "−"}
                  {formatCents(Math.abs(e.delta_cents))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-xs text-muted">
        Method V keeps {EARN.tip.feePercent}% of tips and {EARN.sponsor.feePercent}% of sponsored tries. Sponsored placements are always labeled, and only tries from
        real accounts count.
      </p>
    </div>
  );
}

function DealSection({ title, empty, deals }: { title: string; empty: string; deals: Sponsorship[] }) {
  return (
    <section aria-label={title} className="mt-10">
      <h2 className="display text-3xl">
        {title} {deals.length > 0 && <span className="font-mono text-base text-muted">{deals.length}</span>}
      </h2>
      {deals.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
          {deals.map((d) => (
            <SponsorshipRow key={d.id} deal={d} />
          ))}
        </ul>
      )}
    </section>
  );
}
