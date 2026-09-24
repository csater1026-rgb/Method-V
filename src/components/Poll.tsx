"use client";

import { useState, useTransition } from "react";

import { votePoll } from "@/app/actions";
import type { Poll as PollData } from "@/lib/types";

import { useSignIn } from "./SignIn";

// One-tap poll on a question. Before you vote it's a list of choices; after,
// each shows its share, with your pick marked. Tap another to change it, or
// yours again to take it back.
export function Poll({
  questionId,
  poll,
  signedIn,
  size = "md",
}: {
  questionId: string;
  poll: PollData;
  signedIn: boolean;
  size?: "md" | "lg";
}) {
  const signIn = useSignIn();
  const [state, setState] = useState({ counts: poll.counts, mine: poll.mine });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const total = state.counts.reduce((a, b) => a + b, 0);
  const showResults = state.mine !== null;

  function pick(i: number) {
    if (!signedIn) return signIn("vote in this poll");
    const next = state.mine === i ? null : i;
    const prev = state;
    const counts = [...state.counts];
    if (state.mine !== null) counts[state.mine] = Math.max(0, counts[state.mine] - 1);
    if (next !== null) counts[next] += 1;
    setState({ counts, mine: next });
    setError(null);
    startTransition(async () => {
      const r = await votePoll(questionId, next);
      if (!r.ok) {
        setState(prev);
        setError(r.error);
      } else if (r.counts) {
        setState({ counts: r.counts, mine: next });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Poll">
      {poll.options.map((option, i) => {
        const share = total ? Math.round((state.counts[i] / total) * 100) : 0;
        const mine = state.mine === i;
        return (
          <button
            key={i}
            type="button"
            disabled={pending}
            aria-pressed={mine}
            onClick={() => pick(i)}
            className={`relative overflow-hidden rounded-lg border text-left transition ${
              size === "lg" ? "px-4 py-3 text-base" : "px-3 py-2 text-sm"
            } ${mine ? "border-accent" : "border-line hover:border-muted"}`}
          >
            {showResults && (
              <span
                aria-hidden
                className={`absolute inset-y-0 left-0 ${mine ? "bg-accent/25" : "bg-surface-2"}`}
                style={{ width: `${share}%` }}
              />
            )}
            <span className="relative flex items-center justify-between gap-3">
              <span className="font-semibold">
                {mine && "✓ "}
                {option}
              </span>
              {showResults && <span className="font-mono text-xs text-muted">{share}%</span>}
            </span>
          </button>
        );
      })}
      <p className="font-mono text-[11px] text-muted">
        {total} {total === 1 ? "vote" : "votes"}
        {!showResults && " · tap to vote and see results"}
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
