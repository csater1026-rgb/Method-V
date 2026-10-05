import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatCents } from "@/lib/constants";
import { getViewer } from "@/lib/data";
import { formatCount } from "@/lib/format";
import { getStats, isOwner, STATS_DAYS, type Stats } from "@/lib/stats";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Stats", robots: { index: false } };
export const dynamic = "force-dynamic";

// Only the owner sees this page (see lib/stats.ts); for everyone else it
// doesn't exist.
export default async function StatsPage() {
  if (!isSupabaseConfigured) {
    return (
      <Shell>
        <p className="mt-4 rounded-xl border border-line bg-surface p-4 text-muted">Stats show on the live site, from its database.</p>
      </Shell>
    );
  }
  if (!(await isOwner(await getViewer()))) notFound();
  const stats = await getStats();
  if (!stats) {
    return (
      <Shell>
        <p className="mt-4 rounded-xl border border-line bg-surface p-4 text-muted">Stats need SUPABASE_SECRET_KEY on the server.</p>
      </Shell>
    );
  }
  return (
    <Shell>
      <section aria-label="People" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Accounts" value={stats.accounts} />
        <Tile label="New today" value={stats.newToday} />
        <Tile label="New, last 7 days" value={stats.newWeek} />
        <Tile label="Active, last 7 days" value={stats.activeWeek} hint="Tried, liked, posted, asked, answered, followed or messaged" />
      </section>

      <SignupChart daily={stats.daily} />

      <h2 className="display mt-10 text-4xl">What people are doing</h2>
      <section aria-label="Activity" className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Apps posted" value={stats.apps} hint={`${formatCount(stats.appsWeek)} this week`} />
        <Tile label="Drops" value={stats.drops} />
        <Tile label="Feedback given" value={stats.feedback} hint={`${formatCount(stats.feedbackWeek)} this week`} />
        <Tile label="Tries, last 7 days" value={stats.triesWeek} hint="Opens with Try it" />
        <Tile label="Questions, last 7 days" value={stats.questionsWeek} />
        <Tile label="Answers, last 7 days" value={stats.answersWeek} />
      </section>

      <h2 className="display mt-10 text-4xl">Money in</h2>
      <p className="mt-1 text-sm text-muted">Paid at Stripe, minus refunds, since the start.</p>
      <div className="mt-3 rounded-xl border border-line bg-surface p-4">
        <p className="font-mono text-3xl">{formatCents(stats.paidCents)}</p>
        {stats.paidByKind.length > 0 ? (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th className="py-1 font-medium">For</th>
                <th className="py-1 text-right font-medium">Payments</th>
                <th className="py-1 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {stats.paidByKind.map((k) => (
                <tr key={k.kind} className="border-t border-line">
                  <td className="py-1.5">{KINDS[k.kind] ?? k.kind}</td>
                  <td className="py-1.5 text-right font-mono">{formatCount(k.count)}</td>
                  <td className="py-1.5 text-right font-mono">{formatCents(k.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-muted">No payments yet.</p>
        )}
      </div>

      <h2 className="display mt-10 text-4xl">Newest accounts</h2>
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
        {stats.recent.map((p) => (
          <li key={p.username} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <Link href={`/u/${p.username}`} className="truncate hover:underline">
              {p.display_name || `@${p.username}`} <span className="text-muted">@{p.username}</span>
            </Link>
            <span className="shrink-0 font-mono text-xs text-muted">{new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          </li>
        ))}
        {stats.recent.length === 0 && <li className="px-4 py-3 text-sm text-muted">No accounts yet.</li>}
      </ul>

      <p className="mt-8 text-sm text-muted">
        Visits and page views (including people who haven&apos;t signed up) are in Vercel → your project → Analytics.
      </p>
    </Shell>
  );
}

const KINDS: Record<string, string> = {
  credits: "Methodium packs",
  pro: "Pro",
  tip: "Tips",
  sponsorship: "Boost Exchange sponsorships",
  package: "Sponsorship packages",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="eyebrow">Only you can see this</p>
      <h1 className="display rise mt-1 text-6xl">Stats</h1>
      {children}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-mono text-3xl">{formatCount(value)}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// New accounts per day: one series, so no legend (the heading names it).
// Hover a bar for its day and count; the table below has every number.
function SignupChart({ daily }: { daily: Stats["daily"] }) {
  const max = Math.max(1, ...daily.map((d) => d.count));
  const peak = daily.reduce((a, b) => (b.count > a.count ? b : a), daily[0]);
  return (
    <section aria-label={`New accounts per day, last ${STATS_DAYS} days`} className="mt-6 rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">New accounts per day</h2>
      <p className="text-xs text-muted">Last {STATS_DAYS} days (UTC){peak.count > 0 ? ` · most: ${formatCount(peak.count)} on ${shortDay(peak.day)}` : ""}</p>
      <div className="mt-4 flex h-40 items-end gap-[2px] border-b border-line" role="img" aria-label={daily.map((d) => `${shortDay(d.day)}: ${d.count}`).join(", ")}>
        {daily.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${shortDay(d.day)}: ${d.count} new`}>
            <div
              className="w-full rounded-t-[4px] bg-accent transition-opacity group-hover:opacity-80"
              style={{ height: d.count ? `${Math.max(3, (d.count / max) * 100)}%` : 0 }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-bg group-hover:block">
              {shortDay(d.day)}: {d.count}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-muted">
        <span>{shortDay(daily[0].day)}</span>
        <span>{shortDay(daily.at(-1)!.day)}</span>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">See as a table</summary>
        <table className="mt-2 w-full">
          <tbody>
            {daily.map((d) => (
              <tr key={d.day} className="border-t border-line">
                <td className="py-1">{shortDay(d.day)}</td>
                <td className="py-1 text-right font-mono">{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
