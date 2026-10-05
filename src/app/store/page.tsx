import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Coin } from "@/components/Coin";
import { PayoutPanel, SponsorshipRow } from "@/components/Earn";
import { PackageDealCard } from "@/components/Packages";
import { VStore } from "@/components/VStore";
import { EARN, PACKAGE_RULES, SPOTLIGHT, formatCents } from "@/lib/constants";
import {
  getEarnings,
  getMyApps,
  getMyPackageDeals,
  getMySponsorships,
  getMyStore,
  getOwnProfile,
  getSpotlightNextStart,
  getViewer,
  isPro,
  nowMs,
} from "@/lib/data";
import { demoApps, demoProfiles } from "@/lib/demo";
import { timeAgo } from "@/lib/format";
import { settleRefunds, syncPayoutAccount } from "@/lib/payments";
import { isStripeConfigured } from "@/lib/stripe";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/server";
import type { Earnings, PackageDeal, Sponsorship } from "@/lib/types";

export const metadata: Metadata = { title: "V Store" };

const KIND_LABEL: Record<string, string> = {
  tip: "Backer tip",
  sponsored_try: "Sponsored try",
  sponsor_package: "Sponsorship package",
  payout: "Cashed out",
  payout_failed: "Payout returned",
};

// The V Store (it replaced Earn): an item shop up top where Methodium buys
// upgrades (Methodium is spend-only, never money), then a builder's real
// money below: balance and payouts, sponsorship deals, and where it all came
// from. /earn redirects here.
export default async function StorePage({ searchParams }: PageProps<"/store">) {
  const params = await searchParams;
  const viewer = await getViewer();
  if (isSupabaseConfigured && !viewer) redirect("/login?next=/store");

  // Demo mode previews the store as Ada with 30 Methodium.
  const profile = isSupabaseConfigured ? await getOwnProfile() : demoProfiles[0];
  const pro = isPro(profile);
  const [store, apps, nextSpotlightAt] = await Promise.all([
    getMyStore(viewer),
    isSupabaseConfigured
      ? getMyApps(viewer)
      : Promise.resolve(demoApps.filter((a) => a.owner_id === profile?.id).map((a) => ({ id: a.id, slug: a.slug, name: a.name }))),
    getSpotlightNextStart(),
  ]);
  const credits = viewer?.credits ?? 30;
  // How long until a Spotlight booked now would start ("1d 4h"), or null when a spot is free.
  const waitMins = nextSpotlightAt ? Math.round((new Date(nextSpotlightAt).getTime() - nowMs()) / 60_000) : 0;
  const spotlightWait =
    waitMins < 1
      ? null
      : waitMins >= 1440
        ? `${Math.floor(waitMins / 1440)}d ${Math.floor((waitMins % 1440) / 60)}h`
        : waitMins >= 60
          ? `${Math.floor(waitMins / 60)}h ${waitMins % 60}m`
          : `${waitMins}m`;

  let earnings: Earnings = {
    balance: 0,
    events: [],
    payouts: [],
    account: "none",
    pro_until: null,
  };
  let deals: Sponsorship[] = [];
  let packageDeals: PackageDeal[] = [];
  if (viewer) {
    // Also runs the time-based package steps (expiry refunds, auto-approvals).
    packageDeals = await getMyPackageDeals(viewer);
    const admin = createAdminClient();
    if (admin) {
      // Back from Stripe onboarding: read the account now instead of waiting for the webhook.
      if (params.setup === "done") await syncPayoutAccount(admin, viewer.id);
      // Refunds those steps (or an earlier failed try) marked get sent: your own
      // payments, and the ones on deals you're part of (so a builder opening
      // Earn also sends an expired request's refund to its sponsor).
      await settleRefunds(admin, { userId: viewer.id });
      const dealPayments = packageDeals.map((d) => d.payment_id).filter((id): id is string => Boolean(id));
      if (dealPayments.length > 0) await settleRefunds(admin, { paymentIds: dealPayments });
    }
    [earnings, deals] = await Promise.all([getEarnings(viewer), getMySponsorships(viewer)]);
  }
  const OPEN = ["unpaid", "requested", "accepted", "delivered", "disputed"];
  const packageNeedsYou = packageDeals.filter(
    (d) =>
      (d.mine === "host" && (d.status === "requested" || d.status === "accepted")) ||
      (d.mine === "sponsor" && (d.status === "delivered" || d.status === "unpaid")),
  );
  const packageOpen = packageDeals.filter((d) => OPEN.includes(d.status) && !packageNeedsYou.includes(d));
  const packageDone = packageDeals.filter((d) => !OPEN.includes(d.status));

  const needsYou = deals.filter((d) => (d.status === "offered" && d.mine === "host") || (d.status === "accepted" && d.mine === "sponsor"));
  const running = deals.filter(
    (d) => d.status === "active" || (d.status === "accepted" && d.mine === "host") || (d.status === "offered" && d.mine === "sponsor"),
  );
  const past = deals.filter((d) => !needsYou.includes(d) && !running.includes(d));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Spend your Methodium</p>
          <h1 className="display rise mt-1 -skew-x-6 text-7xl uppercase">V Store</h1>
        </div>
        <Link
          href="/credits"
          className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 hover:border-accent"
          aria-label={`${credits} Methodium. See your Methodium history`}
        >
          <span className="font-mono text-3xl font-bold">
            <Coin />
            {credits}
          </span>
          <span className="text-xs text-muted">
            Methodium
            <br />
            History →
          </span>
        </Link>
      </div>
      {!isSupabaseConfigured && <p className="mt-3 text-sm text-muted">Demo mode: a preview of the store. Buying is off.</p>}

      <VStore
        credits={credits}
        proUntil={pro ? (profile?.pro_until ?? null) : null}
        store={store}
        apps={apps}
        spotlightCost={pro ? SPOTLIGHT.proCost : SPOTLIGHT.cost}
        spotlightWait={spotlightWait}
      />
      <p className="mt-4 text-sm text-muted">
        Need more Methodium?{" "}
        <Link href="/test" className="text-accent hover:underline">
          Earn it with bounties
        </Link>{" "}
        or{" "}
        <Link href="/credits#buy" className="text-accent hover:underline">
          buy a pack
        </Link>
        . Methodium can&apos;t be turned into money.
      </p>

      <div id="earnings" className="mt-16 scroll-mt-24 border-t border-line pt-10">
        <p className="eyebrow">Backers · sponsors · payouts</p>
        <h2 className="display mt-1 text-5xl">Your earnings</h2>
        <p className="mt-1 text-muted">
          Real money: fans can back your apps, and sponsors can pay you for the packages you offer. It all lands here.
        </p>

        {!isSupabaseConfigured && (
          <p className="mt-6 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
            This is demo mode, so there&apos;s no money here. Open an app and tap <strong className="text-ink">Back it</strong> or pick a{" "}
            <strong className="text-ink">sponsorship package</strong> to see how it works.
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
              <span className="tag-accent">Pro</span>{" "}
              <span className="text-muted">
                until{" "}
                {new Date(earnings.pro_until!).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
                .
              </span>{" "}
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
          and it can sponsor apps too.
        </p>

        <section aria-label="Sponsorship packages" className="mt-10">
          <h2 className="display text-3xl">Sponsorship packages</h2>
          <p className="mt-1 text-sm text-muted">
            Set the packages you offer and their prices on your app&apos;s page. To sponsor someone, open their app and pick one.
          </p>
          <PackageList title="Needs you" deals={packageNeedsYou} empty="Nothing waiting on you." />
          <PackageList title="In progress" deals={packageOpen} empty="Nothing in progress." />
          {packageDone.length > 0 && <PackageList title="Done" deals={packageDone} empty="" />}
        </section>

        {deals.length > 0 && (
          <>
            <DealSection title="Pay-per-try deals" empty="" deals={[...needsYou, ...running]} />
            {past.length > 0 && <DealSection title="Past pay-per-try deals" empty="" deals={past} />}
          </>
        )}

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
          Method V keeps {EARN.tip.feePercent}% of tips and {PACKAGE_RULES.feePercent}% of sponsorship packages ({PACKAGE_RULES.proFeePercent}% with
          Pro). Sponsored placements are always labeled.
        </p>
      </div>
    </div>
  );
}

function PackageList({ title, deals, empty }: { title: string; deals: PackageDeal[]; empty: string }) {
  return (
    <div className="mt-4">
      <h3 className="font-semibold">
        {title} {deals.length > 0 && <span className="font-mono text-sm text-muted">{deals.length}</span>}
      </h3>
      {deals.length === 0 ? (
        <p className="mt-1 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {deals.map((d) => (
            <PackageDealCard key={d.id} deal={d} />
          ))}
        </ul>
      )}
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
