"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { answerQuestion, askQuestion, deletePost, markBestAnswer, setVote } from "@/app/actions";
import { timeAgo } from "@/lib/format";
import type { Answer, Question } from "@/lib/types";

import { Avatar } from "./Avatar";

type Props = {
  app: { id: string; slug: string; name: string; owner_id: string };
  questions: Question[];
  viewerId: string | null;
};

// Q&A on an app: ask, answer, upvote, and the asker or builder picks the best
// answer (+5 reputation for whoever wrote it).
export function QandA({ app, questions, viewerId }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {viewerId ? (
        <AskForm app={app} />
      ) : (
        <p className="text-sm text-muted">
          <Link href={`/login?next=${encodeURIComponent(`/apps/${app.slug}?tab=qa`)}`} className="text-accent hover:underline">
            Sign in
          </Link>{" "}
          to ask about {app.name} or answer questions.
        </p>
      )}
      {questions.length === 0 ? (
        <p className="text-sm text-muted">No questions yet. Curious how it works, what it&apos;s built with, or what&apos;s next? Ask.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {questions.map((q) => (
            <QuestionItem key={q.id} question={q} app={app} viewerId={viewerId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AskForm({ app }: { app: Props["app"] }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await askQuestion(app.id, app.slug, body);
          if (result.ok) setBody("");
          else setError(result.error);
        });
      }}
    >
      <div className="flex-1">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          placeholder={`Ask about ${app.name}…`}
          aria-label="Ask a question"
          className="field"
        />
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      <button className="btn-accent" disabled={pending || body.trim().length < 5}>
        Ask
      </button>
    </form>
  );
}

type VoteProps = { kind: "question" | "answer"; id: string; count: number; voted: boolean; own: boolean; signedIn: boolean };

function VoteButton({ kind, id, count, voted, own, signedIn }: VoteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState({ voted, count });
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={state.voted}
      aria-label={state.voted ? "Remove upvote" : "Upvote"}
      disabled={pending || own}
      title={own ? "You can't vote on your own post" : undefined}
      onClick={() => {
        if (!signedIn) {
          router.push(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        const next = !state.voted;
        const prev = state;
        setState({ voted: next, count: state.count + (next ? 1 : -1) });
        startTransition(async () => {
          const result = await setVote(kind, id, next);
          if (!result.ok) setState(prev);
        });
      }}
      className={`flex w-10 shrink-0 flex-col items-center self-start rounded-md border py-1 font-mono text-xs font-bold ${
        state.voted ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:border-muted"
      } disabled:opacity-60`}
    >
      <span aria-hidden>▲</span>
      {state.count}
    </button>
  );
}

function QuestionItem({ question, app, viewerId }: { question: Question; app: Props["app"]; viewerId: string | null }) {
  const [answering, setAnswering] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canPickBest = viewerId !== null && (viewerId === question.user.id || viewerId === app.owner_id);

  function submitAnswer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await answerQuestion(question.id, app.slug, body);
      if (result.ok) {
        setBody("");
        setAnswering(false);
      } else setError(result.error);
    });
  }

  return (
    <li id={`q-${question.id}`} className="rounded-xl border border-line bg-surface p-4">
      <div className="flex gap-3">
        <VoteButton
          kind="question"
          id={question.id}
          count={question.vote_count}
          voted={question.voted}
          own={viewerId === question.user.id}
          signedIn={viewerId !== null}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold break-words">{question.body}</p>
          <Byline user={question.user} at={question.created_at} />
        </div>
      </div>

      {question.answers.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2 border-l-2 border-line pl-3 sm:ml-[52px]">
          {question.answers.map((a) => (
            <AnswerItem
              key={a.id}
              answer={a}
              best={a.id === question.best_answer_id}
              canPickBest={canPickBest}
              questionId={question.id}
              appSlug={app.slug}
              viewerId={viewerId}
              isBuilder={a.user.id === app.owner_id}
            />
          ))}
        </ul>
      )}

      <div className="mt-3 sm:ml-[52px]">
        {viewerId && !answering && (
          <button type="button" className="text-sm font-semibold text-accent hover:underline" onClick={() => setAnswering(true)}>
            Answer
          </button>
        )}
        {answering && (
          <form onSubmit={submitAnswer} className="flex flex-col gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={1000}
              rows={2}
              autoFocus
              placeholder="Your answer"
              aria-label="Your answer"
              className="field"
            />
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex gap-2">
              <button className="btn-accent px-3 py-1.5" disabled={pending || !body.trim()}>
                Post answer
              </button>
              <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => setAnswering(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
        {viewerId === question.user.id && question.answers.length === 0 && (
          <DeleteButton kind="question" id={question.id} appSlug={app.slug} />
        )}
      </div>
    </li>
  );
}

function AnswerItem({
  answer,
  best,
  canPickBest,
  questionId,
  appSlug,
  viewerId,
  isBuilder,
}: {
  answer: Answer;
  best: boolean;
  canPickBest: boolean;
  questionId: string;
  appSlug: string;
  viewerId: string | null;
  isBuilder: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <li className={`flex gap-3 rounded-lg p-2 ${best ? "bg-accent/10" : ""}`}>
      <VoteButton
        kind="answer"
        id={answer.id}
        count={answer.vote_count}
        voted={answer.voted}
        own={viewerId === answer.user.id}
        signedIn={viewerId !== null}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {best && <span className="tag-accent">✓ Best answer</span>}
          {isBuilder && <span className="tag">Builder</span>}
        </div>
        <p className="mt-1 text-[15px] break-words whitespace-pre-line">{answer.body}</p>
        <Byline user={answer.user} at={answer.created_at} />
        <div className="mt-1 flex gap-3">
          {canPickBest && !best && (
            <button
              type="button"
              disabled={pending}
              className="text-xs font-semibold text-accent hover:underline"
              onClick={() =>
                startTransition(async () => {
                  const result = await markBestAnswer(questionId, answer.id, appSlug);
                  if (!result.ok) setError(result.error);
                })
              }
            >
              Mark as best
            </button>
          )}
          {viewerId === answer.user.id && <DeleteButton kind="answer" id={answer.id} appSlug={appSlug} />}
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </li>
  );
}

function Byline({ user, at }: { user: Question["user"]; at: string }) {
  return (
    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
      <Link href={`/u/${user.username}`} className="flex items-center gap-1.5 hover:text-ink">
        <Avatar username={user.username} name={user.display_name} size={18} />@{user.username}
      </Link>
      · <span suppressHydrationWarning>{timeAgo(at)}</span>
    </p>
  );
}

function DeleteButton({ kind, id, appSlug }: { kind: "question" | "answer"; id: string; appSlug: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs text-muted hover:text-danger"
      onClick={() => startTransition(async () => void (await deletePost(kind, id, appSlug)))}
    >
      Delete
    </button>
  );
}
