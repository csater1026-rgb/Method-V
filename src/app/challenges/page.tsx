import type { Metadata } from "next";

import { ChallengeCard, challengePhase } from "@/components/ChallengeCard";
import { getChallenges, nowMs } from "@/lib/data";

export const metadata: Metadata = { title: "Challenges" };

export default async function ChallengesPage() {
  const challenges = await getChallenges();
  const now = nowMs();
  const withPhase = challenges.map((c) => ({ c, phase: challengePhase(c, now) }));
  const live = withPhase.filter((x) => x.phase !== "ended");
  const ended = withPhase.filter((x) => x.phase === "ended");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <p className="eyebrow">Build it · enter it · win it</p>
      <h1 className="display rise mt-1 text-6xl sm:text-7xl">Challenges</h1>
      <p className="mt-1 max-w-xl text-muted">
        Sponsors put up prizes for apps built a certain way or for a certain crowd. Enter one of your apps, and everyone
        gets one vote per challenge.
      </p>

      {live.length > 0 ? (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {live.map(({ c, phase }, i) => (
            <ChallengeCard key={c.id} challenge={c} phase={phase} index={i} />
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-muted">No challenges running right now. Check back soon.</p>
      )}

      {ended.length > 0 && (
        <section aria-label="Past challenges" className="mt-12">
          <h2 className="display text-4xl">Past challenges</h2>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2">
            {ended.map(({ c, phase }, i) => (
              <ChallengeCard key={c.id} challenge={c} phase={phase} index={i} />
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 text-sm text-muted">
        Want to sponsor a challenge for your tool or community? Reach out through the Method V team.
      </p>
    </div>
  );
}
