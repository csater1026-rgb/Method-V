import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar } from "@/components/Avatar";
import { challengePhase } from "@/components/ChallengeCard";
import { EnterChallenge, VoteButton } from "@/components/Challenges";
import { Countdown } from "@/components/Countdown";
import { CATEGORIES, labelFor } from "@/lib/constants";
import { getChallenge, getMyApps, getViewer, nowMs } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function generateMetadata({ params }: PageProps<"/challenges/[slug]">): Promise<Metadata> {
  const found = await getChallenge((await params).slug, null);
  return { title: found ? found.challenge.title : "Challenge not found" };
}

export default async function ChallengePage({ params }: PageProps<"/challenges/[slug]">) {
  const { slug } = await params;
  const viewer = await getViewer();
  const found = await getChallenge(slug, viewer);
  if (!found) notFound();
  const { challenge, entries, votedFor } = found;
  const phase = challengePhase(challenge, nowMs());
  const myApps = await getMyApps(viewer);
  const entered = new Set(entries.map((e) => e.app.id));
  const canEnter = myApps.filter((a) => !entered.has(a.id));
  const ref = { id: challenge.id, slug: challenge.slug };
  const requirement = [
    challenge.stack && `Built with ${challenge.stack}`,
    challenge.category && `${labelFor(CATEGORIES, challenge.category)} apps`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/challenges" className="text-sm text-muted hover:text-ink">
        ← Challenges
      </Link>
      <p className="mt-3 font-mono text-[11px] tracking-widest text-muted uppercase">
        Sponsored by{" "}
        {challenge.sponsor_url ? (
          <a href={challenge.sponsor_url} target="_blank" rel="noopener noreferrer sponsored" className="text-ink hover:underline">
            {challenge.sponsor_name}
          </a>
        ) : (
          <span className="text-ink">{challenge.sponsor_name}</span>
        )}
      </p>
      <h1 className="display rise mt-2 text-6xl break-words sm:text-7xl">{challenge.title}</h1>
      <p className="mt-2 text-lg font-semibold text-accent">🏆 {challenge.prize}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
        {requirement && <span className="tag">{requirement}</span>}
        <span className="font-mono">
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
      {challenge.body && <p className="mt-5 leading-relaxed whitespace-pre-line text-ink/90">{challenge.body}</p>}

      {phase === "open" && canEnter.length > 0 && (
        <div className="mt-6 rounded-xl border border-line bg-surface p-4">
          <p className="mb-3 text-sm font-semibold">Enter one of your apps</p>
          <EnterChallenge challenge={ref} myApps={canEnter} requirement={requirement || null} />
        </div>
      )}
      {phase === "open" && viewer && myApps.length === 0 && (
        <p className="mt-6 text-sm text-muted">
          Want to enter?{" "}
          <Link href="/submit" className="text-accent hover:underline">
            Post your app first
          </Link>
          .
        </p>
      )}

      <section aria-label="Entries" className="mt-10">
        <h2 className="display text-4xl">
          Entries <span className="font-mono text-base text-muted">{entries.length}</span>
        </h2>
        {phase === "open" && entries.length > 0 && <p className="mt-1 text-sm text-muted">One vote each. Tap another entry to move your vote.</p>}
        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No entries yet. Be the first.</p>
        ) : (
          <ol className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
            {entries.map((e, i) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-6 shrink-0 text-center font-mono text-sm text-muted">{i + 1}</span>
                <Link href={`/apps/${e.app.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar username={e.app.owner.username} name={e.app.owner.display_name} src={e.app.owner.avatar_url} size={36} />
                  <span className="min-w-0">
                    <span className="display block truncate text-2xl">
                      {e.app.name}
                      {challenge.winner_entry_id === e.id && <span className="ml-2 tag-accent align-middle">Winner</span>}
                    </span>
                    <span className="block truncate text-xs text-muted">{e.app.tagline}</span>
                  </span>
                </Link>
                <VoteButton
                  challenge={ref}
                  entryId={e.id}
                  voted={votedFor === e.id}
                  count={e.vote_count}
                  signedIn={Boolean(viewer) || !isSupabaseConfigured}
                  open={phase === "open"}
                  own={viewer?.id === e.app.owner_id}
                  onWithdraw
                />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
