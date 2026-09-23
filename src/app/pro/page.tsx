import type { Metadata } from "next";
import Link from "next/link";

import { BuyPro, PinApp } from "@/components/Earn";
import { StatsChart } from "@/components/StatsChart";
import { BOOST, EARN, formatCents } from "@/lib/constants";
import { getAppStats, getMyApps, getOwnProfile, getViewer, isPro } from "@/lib/data";
import { demoApps, demoProfiles } from "@/lib/demo";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Pro" };

const PERKS = [
  { title: "Stats for your apps", body: "Tries per day for the last 30 days, and how many came from sponsor cards." },
  { title: "A pinned app", body: "Put your best app first on your profile, with a Pinned label." },
  { title: "Half-price boosts", body: `Boosts cost ⚡${EARN.pro.boostPerDay} a day instead of ⚡${BOOST.perDay}.` },
  { title: "A Pro badge", body: "Next to your name on your profile." },
];

export default async function ProPage({ searchParams }: PageProps<"/pro">) {
  const params = await searchParams;
  const viewer = await getViewer();
  // Demo mode previews Pro as Ada, so the stats can be seen.
  const profile = isSupabaseConfigured ? await getOwnProfile() : demoProfiles[0];
  const pro = isPro(profile);
  const myApps = isSupabaseConfigured
    ? await getMyApps(viewer)
    : demoApps.filter((a) => a.owner_id === profile?.id).map((a) => ({ id: a.id, slug: a.slug, name: a.name }));
  const picked = myApps.find((a) => a.slug === params.app) ?? myApps[0];
  const stats = pro && picked ? await getAppStats(picked.id) : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="font-mono text-[11px] tracking-widest text-accent uppercase">
        {formatCents(EARN.pro.price)} for {EARN.pro.days} days · no subscription
      </p>
      <h1 className="display rise mt-1 text-6xl">
        Method <span className="inline-block -skew-x-12 bg-accent px-1.5 text-accent-ink">V</span> Pro
      </h1>

      {params.paid && (
        <p className="mt-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
          Thanks! Pro switches on as soon as the payment comes through (usually a few seconds).
        </p>
      )}

      {pro ? (
        <p className="mt-2 text-muted">
          You&apos;re Pro until{" "}
          <strong className="text-ink">
            {new Date(profile!.pro_until!).getFullYear() > 2090
              ? "forever (demo)"
              : new Date(profile!.pro_until!).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
          </strong>
          . Buying again adds another {EARN.pro.days} days.
        </p>
      ) : (
        <p className="mt-2 text-muted">For builders who want to see what&apos;s working. Pay once, it lasts {EARN.pro.days} days.</p>
      )}

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {PERKS.map((p, i) => (
          <li key={p.title} className="rise rounded-xl border border-line bg-surface p-4" style={{ "--i": i } as React.CSSProperties}>
            <p className="font-semibold">{p.title}</p>
            <p className="mt-1 text-sm text-muted">{p.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {!viewer && isSupabaseConfigured ? (
          <Link href="/login?next=/pro" className="btn-accent px-6 py-3 text-base">
            Sign in to get Pro
          </Link>
        ) : (
          <BuyPro label={pro ? `Add ${EARN.pro.days} days · ${formatCents(EARN.pro.price)}` : `Get Pro · ${formatCents(EARN.pro.price)}`} />
        )}
      </div>

      {pro && (
        <section aria-label="Your stats" className="mt-12">
          <h2 className="display text-4xl">Your stats</h2>
          {myApps.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              Post an app to see its stats.{" "}
              <Link href="/submit" className="text-accent hover:underline">
                Post a Drop
              </Link>
            </p>
          ) : (
            <>
              {myApps.length > 1 && (
                <nav aria-label="Your apps" className="mt-3 flex flex-wrap gap-1.5">
                  {myApps.map((a) => (
                    <Link
                      key={a.id}
                      href={`/pro?app=${a.slug}`}
                      aria-current={a.id === picked?.id ? "page" : undefined}
                      className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${
                        a.id === picked?.id ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:text-ink"
                      }`}
                    >
                      {a.name}
                    </Link>
                  ))}
                </nav>
              )}
              <div className="mt-4 rounded-xl border border-line bg-surface p-4">
                {stats ? <StatsChart stats={stats} label={`Tries for ${picked!.name}`} /> : <p className="text-sm text-muted">Couldn&apos;t load stats.</p>}
              </div>
              <div className="mt-4">
                <PinApp apps={myApps} pinned={profile?.pinned_app_id ?? null} />
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
