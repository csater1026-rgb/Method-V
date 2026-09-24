import type { Metadata } from "next";
import Link from "next/link";

import { BuyPro, PinApp } from "@/components/Earn";
import { Wordmark } from "@/components/Wordmark";
import { BOOST, EARN, formatCents } from "@/lib/constants";
import { getMyApps, getOwnProfile, getViewer, isPro } from "@/lib/data";
import { demoApps, demoProfiles } from "@/lib/demo";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Pro" };

const PERKS = [
  { title: "Stats for 30 and 90 days", body: "Tries, likes and feedback per day, where tries come from, and CSV export." },
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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="eyebrow">
        {formatCents(EARN.pro.price)} for {EARN.pro.days} days · no subscription
      </p>
      <h1 className="display rise mt-1 text-6xl">
        <Wordmark className="text-[0.55em]" /> <span className="wordmark text-[0.55em]">Pro</span>
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
        <section aria-label="Your Pro" className="mt-12 flex flex-col gap-4">
          <Link href="/dashboard?days=30" className="btn-ghost self-start">
            Open your stats →
          </Link>
          {myApps.length > 0 && <PinApp apps={myApps} pinned={profile?.pinned_app_id ?? null} />}
        </section>
      )}
    </div>
  );
}
