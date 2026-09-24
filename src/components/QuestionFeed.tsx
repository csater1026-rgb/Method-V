"use client";

import Link from "next/link";

import { formatCount } from "@/lib/format";
import type { QuestionCard } from "@/lib/types";

import { AppTile } from "./AppTile";
import { Avatar } from "./Avatar";
import { Poll } from "./Poll";
import { CategoryChip } from "./Tags";

// The Questions tab in Drops: one question per screen, swipe for the next.
// Polls answer with one tap; everything else opens the thread. Always dark,
// like the video feed, so the tabs over it stay readable.
export function QuestionFeed({ items, signedIn }: { items: QuestionCard[]; signedIn: boolean }) {
  return (
    <div
      className="media-dark no-scrollbar h-[calc(100dvh-var(--chrome)-var(--tabbar))] snap-y snap-mandatory overflow-y-scroll bg-bg text-ink"
      data-testid="question-feed"
    >
      {items.map((q) => (
        <QuestionSlide key={q.id} q={q} signedIn={signedIn} />
      ))}
      <section className="flex h-full snap-start flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="display text-4xl">Got a question?</p>
        <p className="max-w-sm text-muted">Ask people about your app, with a poll if you like. It shows up here for everyone.</p>
        <Link href="/ask" className="btn-accent">
          Ask a question
        </Link>
      </section>
    </div>
  );
}

function QuestionSlide({ q, signedIn }: { q: QuestionCard; signedIn: boolean }) {
  const topAnswer = q.answers.find((a) => a.id === q.best_answer_id) ?? q.answers.find((a) => !a.parent_id);

  return (
    <article aria-label={`Question about ${q.app.name}`} className="flex h-full snap-start snap-always justify-center px-4 pt-20 pb-6">
      <div className="flex w-full max-w-lg flex-col gap-4 overflow-y-auto">
        <Link href={`/apps/${q.app.slug}`} className="flex items-center gap-3">
          <AppTile name={q.app.name} category={q.app.category} poster={q.app.poster_url} size={44} />
          <span className="min-w-0 flex-1">
            <span className="display block truncate text-2xl">{q.app.name}</span>
            <span className="block truncate text-xs text-muted">{q.app.tagline}</span>
          </span>
          {q.by_builder ? <span className="tag-accent shrink-0">Builder asks</span> : <CategoryChip category={q.app.category} />}
        </Link>

        <Link href={`/q/${q.id}`} className="block">
          <h2 className="text-[26px] leading-tight font-semibold break-words sm:text-3xl">{q.body}</h2>
        </Link>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Avatar username={q.user.username} name={q.user.display_name} src={q.user.avatar_url} size={20} />@{q.user.username}
        </p>

        {q.poll && <Poll questionId={q.id} poll={q.poll} signedIn={signedIn} size="lg" />}

        {topAnswer && (
          <Link href={`/q/${q.id}`} className="rounded-lg border border-line bg-surface p-3 text-sm hover:border-accent">
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <Avatar username={topAnswer.user.username} name={topAnswer.user.display_name} src={topAnswer.user.avatar_url} size={16} />@
              {topAnswer.user.username}
              {topAnswer.id === q.best_answer_id && <span className="tag-accent ml-1">✓ Best</span>}
            </span>
            <span className="mt-1 line-clamp-3 block">{topAnswer.body}</span>
          </Link>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <span className="font-mono text-xs text-muted">
            {formatCount(q.answer_count)} {q.answer_count === 1 ? "answer" : "answers"} · ▲ {formatCount(q.vote_count)}
          </span>
          <Link href={`/q/${q.id}`} className="btn-accent px-5">
            {q.answer_count === 0 ? "Be the first to answer →" : "Answer →"}
          </Link>
        </div>
      </div>
    </article>
  );
}
