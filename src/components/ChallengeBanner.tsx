import Link from "next/link";

import type { Challenge } from "@/lib/types";

import { Countdown } from "./Countdown";

// A challenge that's running right now, at the top of Home. Nothing shows
// when none is on.
export function ChallengeBanner({ challenge }: { challenge: Challenge }) {
  return (
    <section aria-label="Challenge" className="px-4">
      <Link
        href={`/challenges/${challenge.slug}`}
        className="rise flex flex-col gap-3 rounded-xl border border-accent bg-surface p-4 transition hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-5"
      >
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Challenge · sponsored by {challenge.sponsor_name}</p>
          <h2 className="display mt-1 text-4xl leading-none">{challenge.title}</h2>
          <p className="mt-1 font-semibold text-accent">🏆 {challenge.prize}</p>
        </div>
        <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
          <span className="font-mono text-xs text-muted">
            Ends in <Countdown to={challenge.ends_at} /> · {challenge.entry_count} {challenge.entry_count === 1 ? "entry" : "entries"}
          </span>
          <span className="btn-accent ml-auto sm:ml-0">Enter your app →</span>
        </div>
      </Link>
    </section>
  );
}
