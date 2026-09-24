"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { answerQuestion, askQuestion, deletePost, markBestAnswer, setVote } from "@/app/actions";
import { timeAgo } from "@/lib/format";
import type { Answer, Question } from "@/lib/types";

import { Avatar } from "./Avatar";
import { Poll } from "./Poll";
import { useSignIn } from "./SignIn";

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

export type QaApp = Props["app"];

// "onAsked" runs after a question posts (e.g. to open its thread).
export function AskForm({ app, onAsked }: { app: Props["app"]; onAsked?: (id: string) => void }) {
  const [body, setBody] = useState("");
  const [options, setOptions] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pollReady = !options || options.filter((o) => o.trim()).length >= 2;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await askQuestion(app.id, app.slug, body, options);
          if (result.ok) {
            setBody("");
            setOptions(null);
            if (result.id) onAsked?.(result.id);
          } else setError(result.error);
        });
      }}
    >
      <div className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          placeholder={`Ask about ${app.name}…`}
          aria-label="Ask a question"
          className="field flex-1"
        />
        <button className="btn-accent" disabled={pending || body.trim().length < 5 || !pollReady}>
          Ask
        </button>
      </div>
      {options ? (
        <fieldset className="flex flex-col gap-2 rounded-lg border border-line p-3">
          <legend className="px-1 text-xs font-semibold">Poll choices · people answer with one tap</legend>
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={o}
                onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
                maxLength={60}
                placeholder={`Choice ${i + 1}`}
                aria-label={`Choice ${i + 1}`}
                className="field flex-1"
              />
              {options.length > 2 && (
                <button type="button" className="text-sm text-muted hover:text-danger" onClick={() => setOptions(options.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </div>
          ))}
          <div className="flex gap-3 text-sm">
            {options.length < 4 && (
              <button type="button" className="font-semibold text-accent hover:underline" onClick={() => setOptions([...options, ""])}>
                + Add a choice
              </button>
            )}
            <button type="button" className="text-muted hover:text-ink" onClick={() => setOptions(null)}>
              No poll
            </button>
          </div>
        </fieldset>
      ) : (
        <button type="button" className="self-start text-sm font-semibold text-accent hover:underline" onClick={() => setOptions(["", ""])}>
          + Add a poll
        </button>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}

type VoteProps = { kind: "question" | "answer"; id: string; count: number; voted: boolean; own: boolean; signedIn: boolean };

function VoteButton({ kind, id, count, voted, own, signedIn }: VoteProps) {
  const signIn = useSignIn();
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
          signIn("vote");
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

export function QuestionItem({
  question,
  app,
  viewerId,
  onThreadPage = false,
}: {
  question: Question;
  app: Props["app"];
  viewerId: string | null;
  onThreadPage?: boolean;
}) {
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
          <p className={`font-semibold break-words ${onThreadPage ? "text-2xl" : "text-[15px]"}`}>{question.body}</p>
          <Byline user={question.user} at={question.created_at} />
          {question.poll && (
            <div className="mt-3 max-w-md">
              <Poll questionId={question.id} poll={question.poll} signedIn={viewerId !== null} />
            </div>
          )}
          {!onThreadPage && (
            <Link href={`/q/${question.id}`} className="mt-2 inline-block text-xs font-semibold text-muted hover:text-accent">
              Open thread →
            </Link>
          )}
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
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const isReply = Boolean(answer.parent_id);

  function sendReply(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await answerQuestion(questionId, appSlug, reply, answer.parent_id ?? answer.id);
      if (result.ok) {
        setReply("");
        setReplying(false);
      } else setError(result.error);
    });
  }

  return (
    <li className={`flex gap-3 rounded-lg p-2 ${best ? "bg-accent/10" : ""} ${isReply ? "ml-8 border-l-2 border-line pl-3" : ""}`}>
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
          {viewerId && (
            <button type="button" className="text-xs font-semibold text-muted hover:text-accent" onClick={() => setReplying((r) => !r)}>
              Reply
            </button>
          )}
          {canPickBest && !best && !isReply && (
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
        {replying && (
          <form onSubmit={sendReply} className="mt-2 flex gap-2">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={1000}
              autoFocus
              placeholder={`Reply to @${answer.user.username}`}
              aria-label="Your reply"
              className="field flex-1 py-1.5"
            />
            <button className="btn-accent px-3 py-1.5" disabled={pending || !reply.trim()}>
              Reply
            </button>
          </form>
        )}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </li>
  );
}

function Byline({ user, at }: { user: Question["user"]; at: string }) {
  return (
    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
      <Link href={`/u/${user.username}`} className="flex items-center gap-1.5 hover:text-ink">
        <Avatar username={user.username} name={user.display_name} src={user.avatar_url} size={18} />@{user.username}
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
