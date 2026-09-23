"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { enterChallenge, voteEntry, withdrawEntry } from "@/app/actions";

import { useSignIn } from "./SignIn";

type MyApp = { id: string; name: string };

export function EnterChallenge({
  challenge,
  myApps,
  requirement,
}: {
  challenge: { id: string; slug: string };
  myApps: MyApp[];
  requirement: string | null;
}) {
  const router = useRouter();
  const [appId, setAppId] = useState(myApps[0]?.id ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      aria-label="Enter"
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const r = await enterChallenge(challenge.id, challenge.slug, appId);
          setMessage(r.ok ? { ok: true, text: "You're in. Share it to get votes!" } : { ok: false, text: r.error });
          if (r.ok) router.refresh();
        });
      }}
    >
      {myApps.length > 1 && (
        <select value={appId} onChange={(e) => setAppId(e.target.value)} aria-label="Your app" className="field w-auto py-2">
          {myApps.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      <button className="btn-accent" disabled={pending || !appId}>
        {pending ? "Entering…" : myApps.length === 1 ? `Enter ${myApps[0].name}` : "Enter this app"}
      </button>
      {requirement && <span className="text-xs text-muted">{requirement}</span>}
      {message && <p className={`w-full text-sm ${message.ok ? "text-accent" : "text-danger"}`}>{message.text}</p>}
    </form>
  );
}

// One vote per challenge: voting for another entry moves it.
export function VoteButton({
  challenge,
  entryId,
  voted,
  count,
  signedIn,
  open,
  own,
  onWithdraw,
}: {
  challenge: { id: string; slug: string };
  entryId: string;
  voted: boolean;
  count: number;
  signedIn: boolean;
  open: boolean;
  own: boolean;
  onWithdraw?: boolean;
}) {
  const router = useRouter();
  const signIn = useSignIn();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (r.ok) router.refresh();
      else setError(r.error ?? "Something went wrong.");
    });
  }

  return (
    <span className="flex flex-col items-end gap-1">
      {own ? (
        onWithdraw && open ? (
          <button
            type="button"
            className="text-xs text-muted hover:text-danger"
            disabled={pending}
            onClick={() => run(() => withdrawEntry(entryId, challenge.slug))}
          >
            Withdraw
          </button>
        ) : (
          <span className="tag">Yours</span>
        )
      ) : (
        <button
          type="button"
          aria-pressed={voted}
          disabled={pending || !open}
          onClick={() => {
            if (!signedIn) return signIn("vote");
            run(() => voteEntry(challenge.id, challenge.slug, voted ? null : entryId));
          }}
          className={`flex min-h-10 items-center gap-1.5 rounded-md border px-3 font-mono text-sm font-semibold ${
            voted ? "border-accent bg-accent text-accent-ink" : "border-line hover:border-accent"
          }`}
        >
          ▲ {count}
        </button>
      )}
      {own && <span className="font-mono text-xs text-muted">▲ {count}</span>}
      {error && <span className="max-w-40 text-right text-xs text-danger">{error}</span>}
    </span>
  );
}
