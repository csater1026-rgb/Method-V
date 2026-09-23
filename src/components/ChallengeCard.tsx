import Link from "next/link";

import type { Challenge } from "@/lib/types";

import { Countdown } from "./Countdown";

export function challengePhase(c: Pick<Challenge, "starts_at" | "ends_at">, now: number): "upcoming" | "open" | "ended" {
  if (now < new Date(c.starts_at).getTime()) return "upcoming";
  return now < new Date(c.ends_at).getTime() ? "open" : "ended";
}

export function ChallengeCard({ challenge, phase, index = 0 }: { challenge: Challenge; phase: "upcoming" | "open" | "ended"; index?: number }) {
  return (
    <li className="rise" style={{ "--i": index } as React.CSSProperties}>
      <Link
        href={`/challenges/${challenge.slug}`}
        className="flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-4 transition hover:border-accent"
      >
        <p className="font-mono text-[10px] tracking-widest text-muted uppercase">Sponsored by {challenge.sponsor_name}</p>
        <h3 className="display text-4xl leading-none">{challenge.title}</h3>
        <p className="font-semibold text-accent">🏆 {challenge.prize}</p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-xs text-muted">
          {challenge.stack && <span className="tag">Built with {challenge.stack}</span>}
          <span className="font-mono">
            {challenge.entry_count} {challenge.entry_count === 1 ? "entry" : "entries"}
          </span>
          <span className="ml-auto font-mono">
            {phase === "open" ? (
              <>
                Ends in <Countdown to={challenge.ends_at} />
              </>
            ) : phase === "upcoming" ? (
              <>
                Opens in <Countdown to={challenge.starts_at} />
              </>
            ) : (
              "Ended"
            )}
          </span>
        </div>
      </Link>
    </li>
  );
}
