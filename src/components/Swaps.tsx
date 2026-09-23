"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { endSwap, proposeSwap, respondSwap } from "@/app/actions";
import type { ActionResult, Swap } from "@/lib/types";

import { Countdown } from "./Countdown";

type MyApp = { id: string; name: string };

// "Team up" card on another builder's app page: swap shoutouts, or launch on
// the same day. Two taps, one optional date.
export function TeamUp({ target, myApps }: { target: { id: string; name: string }; myApps: MyApp[] }) {
  const [fromId, setFromId] = useState(myApps[0]?.id ?? "");
  const [mode, setMode] = useState<"idle" | "colaunch">("idle");
  const [when, setWhen] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function send(kind: "swap" | "colaunch") {
    setMessage(null);
    startTransition(async () => {
      const result = await proposeSwap(fromId, target.id, kind, kind === "colaunch" && when ? new Date(when).toISOString() : null);
      setMessage(
        result.ok
          ? { ok: true, text: `Sent! ${target.name}'s builder will see it on their Swaps page.` }
          : { ok: false, text: result.error },
      );
      if (result.ok) setMode("idle");
    });
  }

  return (
    <section aria-label="Team up" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="display text-3xl">Team up</h2>
      <p className="mt-1 text-sm text-muted">
        Swap shoutouts so each app shows the other, or launch on the same day. Free.
      </p>
      {myApps.length > 1 && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-muted">Your app</span>
          <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="field w-auto py-1.5">
            {myApps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {mode === "idle" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-accent" disabled={pending} onClick={() => send("swap")}>
            Swap shoutouts
          </button>
          <button type="button" className="btn-ghost" disabled={pending} onClick={() => setMode("colaunch")}>
            Launch together
          </button>
        </div>
      ) : (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send("colaunch");
          }}
        >
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            aria-label="Launch date and time"
            required
            className="field w-auto flex-1"
          />
          <button className="btn-accent" disabled={pending}>
            Propose date
          </button>
          <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => setMode("idle")}>
            Cancel
          </button>
        </form>
      )}
      {message && <p className={`mt-2 text-sm ${message.ok ? "text-accent" : "text-danger"}`}>{message.text}</p>}
    </section>
  );
}

// One row on the Swaps page, with the actions that make sense for it.
export function SwapRow({ swap, incoming }: { swap: Swap; incoming: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const mine = incoming ? swap.to : swap.from;
  const theirs = incoming ? swap.from : swap.to;

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 text-sm">
        <p>
          <span className="tag mr-2">{swap.kind === "swap" ? "Shoutout swap" : "Co-launch"}</span>
          <Link href={`/apps/${mine.slug}`} className="font-semibold hover:underline">
            {mine.name}
          </Link>{" "}
          <span className="text-muted">{swap.kind === "swap" ? "⇄" : "+"}</span>{" "}
          <Link href={`/apps/${theirs.slug}`} className="font-semibold hover:underline">
            {theirs.name}
          </Link>
        </p>
        {swap.launch_at && (
          <p className="mt-1 text-xs text-muted">
            Launch in <Countdown to={swap.launch_at} className="font-mono text-accent" />
          </p>
        )}
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      <div className="flex gap-2">
        {swap.status === "pending" && incoming && (
          <>
            <button type="button" className="btn-accent px-3 py-1.5" disabled={pending} onClick={() => run(() => respondSwap(swap.id, true))}>
              Accept
            </button>
            <button type="button" className="btn-ghost px-3 py-1.5" disabled={pending} onClick={() => run(() => respondSwap(swap.id, false))}>
              Decline
            </button>
          </>
        )}
        {swap.status === "pending" && !incoming && (
          <button type="button" className="btn-ghost px-3 py-1.5" disabled={pending} onClick={() => run(() => endSwap(swap.id))}>
            Withdraw
          </button>
        )}
        {swap.status === "accepted" && swap.kind === "swap" && (
          <button type="button" className="text-sm text-muted hover:text-danger" disabled={pending} onClick={() => run(() => endSwap(swap.id))}>
            End swap
          </button>
        )}
      </div>
    </li>
  );
}
