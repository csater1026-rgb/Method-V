"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { answerBounty, awardBounty, cancelBounty, postBounty } from "@/app/actions";
import { BOUNTIES } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import type { ActionResult, Bounty, BountyListing } from "@/lib/types";

import { Avatar } from "./Avatar";
import { Coin } from "./Coin";
import { Handle } from "./Handle";

function daysLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "closing";
  const days = Math.ceil(ms / 86_400_000);
  return days === 1 ? "1 day left" : `${days} days left`;
}

const STATUS: Record<Bounty["status"], string> = {
  open: "Open",
  awarded: "Paid to the best answer",
  split: "Split between everyone who answered",
  refunded: "Closed, nobody answered",
  cancelled: "Taken down",
};

// Bounties on an app's page: tasks the builder pays Methodium for. Anyone can
// answer an open one; the builder picks the best answer and it's paid. If
// they don't pick by the deadline, it's split between everyone who answered.
export function BountiesSection({
  app,
  bounties,
  isOwner,
  signedIn,
  preview = false,
}: {
  app: { id: string; slug: string; name: string };
  bounties: Bounty[];
  isOwner: boolean;
  signedIn: boolean;
  preview?: boolean;
}) {
  const [posting, setPosting] = useState(false);
  if (!isOwner && !preview && bounties.length === 0) return null;
  const open = bounties.filter((b) => b.status === "open").length;

  return (
    <section id="bounties" aria-labelledby="bounties-title" className="scroll-mt-20 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="bounties-title" className="display text-4xl">
          Bounties
        </h2>
        <span className="text-xs text-muted">Earn Methodium</span>
      </div>
      <p className="mt-1 text-sm text-muted">
        {isOwner
          ? "Pay Methodium for a specific job: find a bug, record a first try, review your pricing page. The reward is held now and paid to the answer you pick."
          : `Jobs ${app.name}'s builder pays Methodium for. Answer one; the best answer gets the reward.`}
      </p>

      {bounties.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {bounties.map((b) => (
            <li key={b.id}>
              <BountyCard bounty={b} app={app} isOwner={isOwner} signedIn={signedIn} />
            </li>
          ))}
        </ul>
      )}

      {(isOwner || preview) &&
        (posting ? (
          <BountyForm app={app} onDone={() => setPosting(false)} />
        ) : (
          open < BOUNTIES.perApp && (
            <button type="button" onClick={() => setPosting(true)} className="btn-ghost mt-4">
              + Post a bounty
            </button>
          )
        ))}
    </section>
  );
}

function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionResult>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) after?.();
      else setError(result.error);
    });
  };
  return { error, pending, run };
}

export function BountyCard({
  bounty,
  app,
  isOwner = false,
  signedIn = true,
  showApp = false,
}: {
  bounty: Bounty;
  app: { slug: string; name: string };
  isOwner?: boolean;
  signedIn?: boolean;
  showApp?: boolean;
}) {
  const [answering, setAnswering] = useState(false);
  const { error, pending, run } = useAction();
  const open = bounty.status === "open";
  const mine = !isOwner ? bounty.answers[0] : undefined;

  return (
    <article className="rounded-lg border border-line bg-bg/50 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {showApp && (
            <Link href={`/apps/${app.slug}#bounties`} className="font-mono text-[11px] tracking-wide text-muted uppercase hover:text-ink">
              {app.name}
            </Link>
          )}
          <h3 className="text-lg leading-tight font-semibold">{bounty.title}</h3>
        </div>
        <span className="tag-accent inline-flex shrink-0 items-center gap-1 font-mono">
          <Coin /> {bounty.reward}
        </span>
      </header>
      {bounty.details && <p className="mt-1.5 text-sm whitespace-pre-line text-muted">{bounty.details}</p>}
      <p className="mt-2 font-mono text-xs text-muted">
        {open ? daysLeft(bounty.expires_at) : STATUS[bounty.status]} · {bounty.answer_count} {bounty.answer_count === 1 ? "answer" : "answers"}
      </p>

      {/* The builder: every answer, and the button to pay the best one. */}
      {isOwner && bounty.answers.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {bounty.answers.map((a) => (
            <li key={a.id} className={`rounded-md border p-3 text-sm ${bounty.winner_id === a.user.id ? "border-accent" : "border-line"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/u/${a.user.username}`} className="flex items-center gap-1.5 font-semibold hover:underline">
                  <Avatar username={a.user.username} name={a.user.display_name} src={a.user.avatar_url} size={20} />
                  <Handle username={a.user.username} />
                </Link>
                <span className="text-xs text-muted" suppressHydrationWarning>
                  {timeAgo(a.created_at)}
                </span>
                {bounty.winner_id === a.user.id && <span className="tag-accent ml-auto">Winner</span>}
              </div>
              <p className="mt-1.5 break-words whitespace-pre-line">{a.body}</p>
              {a.link && (
                <a href={a.link} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 block truncate text-accent hover:underline">
                  {a.link}
                </a>
              )}
              {open && (
                <button type="button" disabled={pending} onClick={() => run(() => awardBounty(a.id, app.slug))} className="btn-accent mt-2 px-3 py-1 text-xs">
                  Pick as best · pay {bounty.reward} Methodium
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isOwner && open && bounty.answer_count === 0 && (
        <button type="button" disabled={pending} onClick={() => run(() => cancelBounty(bounty.id, app.slug))} className="mt-3 text-xs text-muted underline hover:text-ink">
          Take it down (you get the {bounty.reward} Methodium back)
        </button>
      )}

      {/* Everyone else: answer it, or see your answer. */}
      {!isOwner &&
        (mine ? (
          <div className="mt-3 rounded-md border border-line p-3 text-sm">
            <p className="text-xs font-semibold text-muted uppercase">
              {bounty.winner_id === mine.user.id ? "Your answer won" : "Your answer"}
            </p>
            <p className="mt-1 break-words whitespace-pre-line">{mine.body}</p>
          </div>
        ) : open ? (
          !signedIn ? (
            <Link href="/login" className="btn-ghost mt-3 inline-block">
              Sign in to answer
            </Link>
          ) : answering ? (
            <AnswerForm bountyId={bounty.id} appSlug={app.slug} onDone={() => setAnswering(false)} />
          ) : (
            <button type="button" onClick={() => setAnswering(true)} className="btn-accent mt-3">
              Answer it
            </button>
          )
        ) : null)}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </article>
  );
}

function AnswerForm({ bountyId, appSlug, onDone }: { bountyId: string; appSlug: string; onDone: () => void }) {
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const { error, pending, run } = useAction();
  return (
    <form
      aria-label="Answer the bounty"
      className="mt-3 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => answerBounty(bountyId, appSlug, body, link), onDone);
      }}
    >
      <textarea
        className="field min-h-24"
        value={body}
        maxLength={2000}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What you found or did, in detail. Steps to repeat a bug help a lot."
        aria-label="Your answer"
        required
      />
      <input className="field" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link to a video or screenshot (optional)" aria-label="Link" />
      <p className="text-xs text-muted">
        Only the builder sees your answer. If they don&apos;t pick one by the deadline, the reward is split between everyone who answered.
      </p>
      <div className="flex gap-2">
        <button className="btn-accent" disabled={pending || body.trim().length < BOUNTIES.minAnswer}>
          {pending ? "Sending…" : "Send answer"}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost">
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function BountyForm({ app, onDone }: { app: { id: string; slug: string }; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [reward, setReward] = useState(20);
  const [days, setDays] = useState<number>(BOUNTIES.days);
  const { error, pending, run } = useAction();
  return (
    <form
      aria-label="Post a bounty"
      className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-bg/50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => postBounty(app.id, app.slug, { title, details, reward, days }), onDone);
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        What do you want done?
        <input className="field" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="Find a bug in checkout" required />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Details <span className="font-normal text-muted">· Optional</span>
        <textarea className="field min-h-20" value={details} maxLength={1000} onChange={(e) => setDetails(e.target.value)} placeholder="What a great answer looks like" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Reward in Methodium
          <input className="field" type="number" min={BOUNTIES.minReward} max={BOUNTIES.maxReward} value={reward} onChange={(e) => setReward(Number(e.target.value))} required />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Days to answer
          <input className="field" type="number" min={BOUNTIES.minDays} max={BOUNTIES.maxDays} value={days} onChange={(e) => setDays(Number(e.target.value))} required />
        </label>
      </div>
      <p className="text-xs text-muted">
        The reward is held from your Methodium now. Pick the best answer to pay it. Nobody answers: you get it back. You don&apos;t pick: it&apos;s split
        between everyone who answered.
      </p>
      <div className="flex gap-2">
        <button className="btn-accent" disabled={pending}>
          {pending ? "Posting…" : `Post · hold ${reward} Methodium`}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost">
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

// Open bounties across Method V, on the Methodium page.
export function BountyList({ bounties }: { bounties: BountyListing[] }) {
  return (
    <ul className="mt-4 flex flex-col gap-3">
      {bounties.map((b) => (
        <li key={b.id}>
          <BountyCard bounty={b} app={b.app} showApp />
        </li>
      ))}
    </ul>
  );
}
