import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StatsChart } from "@/components/StatsChart";
import { ANALYTICS_FREE_DAYS, ANALYTICS_RANGES, TRY_SOURCES, labelFor } from "@/lib/constants";
import { dashboardContext } from "@/lib/dashboard";
import { getAnalytics, getApp } from "@/lib/data";
import { formatCount } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Stats" };

// Builder analytics: how each app is doing and where its tries come from.
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const params = await searchParams;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const ctx = await dashboardContext(str(params.app), str(params.days));
  if (isSupabaseConfigured && !ctx.viewer) redirect("/login?next=/dashboard");
  const { apps, app, days, pro, lockedRange } = ctx;

  const [analytics, detail] = app ? await Promise.all([getAnalytics(app.id, days), getApp(app.slug)]) : [null, null];
  const href = (slug: string | undefined, d: number) => `/dashboard?${new URLSearchParams({ ...(slug ? { app: slug } : {}), days: String(d) })}`;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <p className="font-mono text-[11px] tracking-widest text-accent uppercase">Analytics</p>
      <h1 className="display rise mt-1 text-6xl">Stats</h1>
      <p className="mt-1 text-muted">How your apps are doing, and where people find them.</p>
      {!isSupabaseConfigured && <p className="mt-2 text-sm text-muted">Demo mode: sample numbers for Ada&apos;s apps.</p>}

      {!app ? (
        <p className="mt-8 text-muted">
          Post an app to see its stats.{" "}
          <Link href="/submit" className="text-accent hover:underline">
            Post a Drop
          </Link>
        </p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Your apps" className="flex flex-wrap gap-1.5">
              {apps.map((a) => (
                <Link
                  key={a.id}
                  href={href(a.slug, days)}
                  aria-current={a.id === app.id ? "page" : undefined}
                  className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
                    a.id === app.id ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:text-ink"
                  }`}
                >
                  {a.name}
                </Link>
              ))}
            </nav>
            <nav aria-label="Range" className="flex gap-1">
              {ANALYTICS_RANGES.map((d) => {
                const locked = d > ANALYTICS_FREE_DAYS && !pro;
                return (
                  <Link
                    key={d}
                    href={locked ? "/pro" : href(app.slug, d)}
                    aria-current={d === days ? "page" : undefined}
                    title={locked ? "Part of Pro" : undefined}
                    className={`rounded-md border px-2.5 py-1.5 font-mono text-xs font-semibold ${
                      d === days ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:text-ink"
                    }`}
                  >
                    {d}d{locked && " 🔒"}
                  </Link>
                );
              })}
            </nav>
          </div>
          {lockedRange && (
            <p className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              More than {ANALYTICS_FREE_DAYS} days is part of{" "}
              <Link href="/pro" className="text-accent hover:underline">
                Pro
              </Link>
              . Showing the last {ANALYTICS_FREE_DAYS}.
            </p>
          )}

          {!analytics || "error" in analytics ? (
            <p className="mt-6 text-sm text-danger">{analytics && "error" in analytics ? analytics.error : "Couldn't load stats."}</p>
          ) : (
            <>
              <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Total label="Tries" value={analytics.daily.reduce((n, d) => n + d.tries, 0)} />
                <Total label="From sponsors" value={analytics.daily.reduce((n, d) => n + d.sponsored, 0)} />
                <Total label="Likes" value={analytics.daily.reduce((n, d) => n + d.likes, 0)} />
                <Total label="Feedback" value={analytics.daily.reduce((n, d) => n + d.feedback, 0)} />
              </dl>

              <section aria-label="Tries per day" className="mt-6 rounded-xl border border-line bg-surface p-4">
                <h2 className="mb-3 text-sm font-semibold">Tries per day</h2>
                <StatsChart stats={analytics.daily} label={`Tries for ${app.name}`} />
              </section>

              <section aria-label="Where tries come from" className="mt-6 rounded-xl border border-line bg-surface p-4">
                <h2 className="text-sm font-semibold">Where tries come from</h2>
                <Sources sources={analytics.sources} />
              </section>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                {pro ? (
                  <a href={`/dashboard/export?app=${app.slug}&days=${days}`} className="btn-ghost" download>
                    Download CSV
                  </a>
                ) : (
                  <Link href="/pro" className="text-accent hover:underline">
                    Get Pro for 30 and 90 days and CSV export →
                  </Link>
                )}
              </div>
            </>
          )}

          {detail && (
            <section aria-label="All time" className="mt-10">
              <h2 className="display text-3xl">All time</h2>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Total label="Tries" value={detail.try_count} />
                <Total label="Likes" value={detail.like_count} />
                <Total label="Backers" value={detail.backer_count} />
                <Total label="Testers" value={detail.feedback_count} />
              </dl>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-3">
      <dt className="font-mono text-[10px] tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-1 font-mono text-2xl font-bold">{formatCount(value)}</dd>
    </div>
  );
}

function Sources({ sources }: { sources: { source: string; tries: number }[] }) {
  const total = sources.reduce((n, s) => n + s.tries, 0);
  if (total === 0) return <p className="mt-2 text-sm text-muted">No tries in this range yet.</p>;
  const sorted = [...sources].sort((a, b) => b.tries - a.tries);
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {sorted.map((s) => {
        const pct = Math.round((s.tries / total) * 100);
        return (
          <li key={s.source} className="text-sm">
            <div className="flex justify-between gap-3">
              <span>{labelFor(TRY_SOURCES, s.source)}</span>
              <span className="font-mono text-xs text-muted">
                {s.tries} · {pct}%
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
