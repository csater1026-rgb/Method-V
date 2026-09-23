"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cancelTesters, markHelpful, requestTesters, submitFeedback } from "@/app/actions";
import { CREDITS, TESTER_PACKS, WOULD_USE, labelFor } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import type { Feedback, FeedbackPanel as Panel, TestRequest } from "@/lib/types";

import { Avatar } from "./Avatar";
import { RankTag } from "./Passport";

type AppRef = { id: string; slug: string; name: string };

// Structured feedback and try-to-earn credits on an app page. What shows
// depends on who's looking: the builder, a signed-in tester, or a visitor.
export function FeedbackPanel({ panel, app }: { panel: Panel; app: AppRef }) {
  const open = panel.request && panel.request.slots_filled < panel.request.slots_total ? panel.request : null;

  return (
    <section id="feedback" className="scroll-mt-20 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="display text-4xl">Feedback</h2>
        {open && panel.mode !== "owner" && (
          <span className="tag-accent">
            ⚡ Earn {CREDITS.feedbackReward} credits · {open.slots_total - open.slots_filled} spots left
          </span>
        )}
      </div>

      {panel.mode === "demo" && (
        <p className="mt-2 text-sm text-muted">
          Testers who try an app and leave honest feedback earn credits, and builders spend credits to get testers. It&apos;s
          off in demo mode.
        </p>
      )}

      {panel.mode === "signed-out" && (
        <p className="mt-2 text-sm text-muted">
          <Link href={`/login?next=${encodeURIComponent(`/apps/${app.slug}#feedback`)}`} className="text-accent hover:underline">
            Sign in
          </Link>{" "}
          to try {app.name}, give feedback{open ? ` and earn ${CREDITS.feedbackReward} credits` : ""}.
        </p>
      )}

      {panel.mode === "tester" &&
        (panel.mine ? (
          <div className="mt-3">
            <p className="text-sm text-muted">
              {panel.mine.earned > 0
                ? `Thanks! You earned ${panel.mine.earned} credits for this.`
                : "Thanks! Your feedback went to the builder."}{" "}
              Only you and the builder can see it.
            </p>
            <FeedbackItem item={panel.mine} />
          </div>
        ) : panel.tried ? (
          <FeedbackForm app={app} open={open} />
        ) : (
          <TryFirst app={app} open={open} />
        ))}

      {panel.mode === "owner" && (
        <OwnerView app={app} request={panel.request} feedback={panel.feedback} credits={panel.credits} />
      )}
    </section>
  );
}

function TryFirst({ app, open }: { app: AppRef; open: TestRequest | null }) {
  const router = useRouter();
  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className="text-sm text-muted">
        Open {app.name} with Try it, use it for a minute, then come back here to give feedback
        {open ? ` and earn ${CREDITS.feedbackReward} credits` : ""}.
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={`/try/${app.slug}?via=page`}
          target="_blank"
          rel="noopener"
          className="btn-accent"
          // Once the try is recorded, the form can show.
          onClick={() => setTimeout(() => router.refresh(), 2000)}
        >
          Try it →
        </a>
        <button type="button" className="btn-ghost" onClick={() => router.refresh()}>
          I&apos;ve tried it
        </button>
      </div>
    </div>
  );
}

function FeedbackForm({ app, open }: { app: AppRef; open: TestRequest | null }) {
  const [wouldUse, setWouldUse] = useState<string>("");
  const [rating, setRating] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await submitFeedback(app.id, app.slug, {
        wouldUse,
        rating,
        worked: String(formData.get("worked") ?? ""),
        confusing: String(formData.get("confusing") ?? ""),
      });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <form action={submit} className="mt-3 flex flex-col gap-4">
      <p className="text-sm text-muted">
        Honest and specific helps most. Only the builder sees what you write
        {open ? `; you earn ${CREDITS.feedbackReward} credits` : ""}.
      </p>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Would you use it?</legend>
        <div className="flex gap-2">
          {WOULD_USE.map((o) => (
            <label
              key={o.slug}
              className="cursor-pointer rounded-md border border-line px-4 py-2 text-sm font-semibold has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-accent-ink"
            >
              <input
                type="radio"
                name="would_use"
                value={o.slug}
                checked={wouldUse === o.slug}
                onChange={() => setWouldUse(o.slug)}
                className="sr-only"
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Rating</legend>
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onClick={() => setRating(n)}
              className={`text-2xl leading-none ${n <= rating ? "text-accent" : "text-line hover:text-muted"}`}
            >
              ★
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">What worked?</span>
        <textarea name="worked" required minLength={10} maxLength={1000} rows={3} className="field" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">
          What confused you? <span className="font-normal text-muted">· Optional</span>
        </span>
        <textarea name="confusing" maxLength={1000} rows={3} className="field" />
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}
      <button className="btn-accent self-start" disabled={pending || !wouldUse || rating === 0}>
        {pending ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}

function OwnerView({
  app,
  request,
  feedback,
  credits,
}: {
  app: AppRef;
  request: TestRequest | null;
  feedback: Feedback[];
  credits: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const open = request && request.slots_filled < request.slots_total ? request : null;

  function buy(testers: number) {
    setError(null);
    startTransition(async () => {
      const result = await requestTesters(app.id, app.slug, testers);
      if (!result.ok) setError(result.error);
    });
  }

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelTesters(app.id, app.slug);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-5">
      <div className="rounded-lg border border-line bg-bg/50 p-4">
        <h3 className="display text-2xl">Get testers</h3>
        {open ? (
          <>
            <p className="mt-1 text-sm text-muted">
              {app.name} is in the Test &amp; earn queue: {open.slots_filled} of {open.slots_total} spots filled.
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full bg-accent" style={{ width: `${(open.slots_filled / open.slots_total) * 100}%` }} />
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">
            Put {app.name} in the Test &amp; earn queue. Each tester costs {CREDITS.perTester} credits, and they earn them by
            trying your app and telling you what worked and what didn&apos;t.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {TESTER_PACKS.map((n) => {
            const cost = n * CREDITS.perTester;
            return (
              <button
                key={n}
                type="button"
                onClick={() => buy(n)}
                disabled={pending || credits < cost}
                className="btn-ghost"
              >
                +{n} testers · ⚡{cost}
              </button>
            );
          })}
          {open && (
            <button type="button" onClick={cancel} disabled={pending} className="text-sm text-muted hover:text-danger">
              Stop and refund ⚡{(open.slots_total - open.slots_filled) * CREDITS.perTester}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">
          You have ⚡{credits}.{" "}
          <Link href="/test" className="text-accent hover:underline">
            Test other apps
          </Link>{" "}
          to earn more.
        </p>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>

      {feedback.length === 0 ? (
        <p className="text-sm text-muted">No feedback yet. It shows up here, and only you can see it.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {feedback.map((item) => (
            <li key={item.id}>
              <FeedbackItem item={item} appSlug={app.slug} canMarkHelpful />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FeedbackItem({ item, appSlug, canMarkHelpful }: { item: Feedback; appSlug?: string; canMarkHelpful?: boolean }) {
  const [helpful, setHelpful] = useState(Boolean(item.helpful_at));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function mark() {
    if (!appSlug) return;
    setError(null);
    startTransition(async () => {
      const result = await markHelpful(item.id, appSlug);
      if (result.ok) setHelpful(true);
      else setError(result.error);
    });
  }

  return (
    <article className="mt-3 rounded-lg border border-line bg-bg/50 p-4 text-sm">
      <header className="flex flex-wrap items-center gap-2">
        <Link href={`/u/${item.user.username}`} className="flex items-center gap-2 font-semibold hover:underline">
          <Avatar username={item.user.username} name={item.user.display_name} size={24} />@{item.user.username}
        </Link>
        <RankTag rank={item.user_rank} />
        <span className="text-accent" aria-label={`${item.rating} out of 5 stars`}>
          {"★".repeat(item.rating)}
          <span className="text-line">{"★".repeat(5 - item.rating)}</span>
        </span>
        <span className="tag">Would use: {labelFor(WOULD_USE, item.would_use)}</span>
        <span className="ml-auto text-xs text-muted" suppressHydrationWarning>
          {timeAgo(item.created_at)}
        </span>
      </header>
      <p className="mt-3 text-xs font-semibold text-muted uppercase">What worked</p>
      <p className="mt-0.5 break-words whitespace-pre-line">{item.worked}</p>
      {item.confusing && (
        <>
          <p className="mt-3 text-xs font-semibold text-muted uppercase">What was confusing</p>
          <p className="mt-0.5 break-words whitespace-pre-line">{item.confusing}</p>
        </>
      )}
      {canMarkHelpful && (
        <div className="mt-3">
          {helpful ? (
            <span className="text-xs text-accent">✓ Marked helpful</span>
          ) : (
            <button type="button" onClick={mark} disabled={pending} className="btn-ghost px-3 py-1 text-xs">
              Mark helpful · gives them ⚡{CREDITS.helpfulBonus}
            </button>
          )}
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        </div>
      )}
    </article>
  );
}
