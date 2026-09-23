import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SwapRow } from "@/components/Swaps";
import { getMyApps, getMySwaps, getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { Swap } from "@/lib/types";

export const metadata: Metadata = { title: "Swaps" };

export default async function SwapsPage() {
  const viewer = await getViewer();
  if (isSupabaseConfigured && !viewer) redirect("/login?next=/swaps");

  const [swaps, myApps] = viewer ? await Promise.all([getMySwaps(viewer), getMyApps(viewer)]) : [[], []];
  const mine = new Set(myApps.map((a) => a.id));
  const incoming = (s: Swap) => mine.has(s.to.id);

  const requests = swaps.filter((s) => s.status === "pending" && incoming(s));
  const sent = swaps.filter((s) => s.status === "pending" && !incoming(s));
  const active = swaps.filter((s) => s.status === "accepted");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="display rise text-6xl">Swaps</h1>
      <p className="mt-1 text-muted">
        Team up with other builders: swap shoutouts so your apps show each other, or launch on the same day. To start one,
        open another builder&apos;s app and tap <strong>Team up</strong>.
      </p>

      {!isSupabaseConfigured && <p className="mt-6 text-sm text-muted">Swaps are off in demo mode.</p>}

      <Section title="Requests for you" empty="No requests right now." swaps={requests} incoming />
      <Section title="Active" empty="No active swaps or co-launches yet." swaps={active} mine={mine} />
      <Section title="Sent" empty="Nothing waiting on an answer." swaps={sent} />

      {viewer && myApps.length === 0 && (
        <p className="mt-8 text-sm text-muted">
          You&apos;ll need an app first.{" "}
          <Link href="/submit" className="text-accent hover:underline">
            Post a Drop
          </Link>
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  empty,
  swaps,
  incoming,
  mine,
}: {
  title: string;
  empty: string;
  swaps: Swap[];
  incoming?: boolean;
  mine?: Set<string>;
}) {
  return (
    <section aria-label={title} className="mt-8">
      <h2 className="display text-3xl">
        {title} {swaps.length > 0 && <span className="text-muted">{swaps.length}</span>}
      </h2>
      {swaps.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
          {swaps.map((s) => (
            <SwapRow key={s.id} swap={s} incoming={incoming ?? (mine ? mine.has(s.to.id) : false)} />
          ))}
        </ul>
      )}
    </section>
  );
}
