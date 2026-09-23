"use client";

import { useState, useTransition } from "react";

import { boostApp, cancelLaunch, scheduleLaunch } from "@/app/actions";
import { BOOST } from "@/lib/constants";
import type { AppStatus } from "@/lib/data";
import type { ActionResult } from "@/lib/types";

import { Countdown } from "./Countdown";

type Props = {
  app: { id: string; slug: string; name: string; launch_at: string | null };
  status: AppStatus;
  credits: number;
  // Demo mode: shown to everyone as a preview; the buttons explain demo mode.
  preview?: boolean;
  children?: React.ReactNode;
};

// Builder-only tools on their own app page: launch day and boosts. The share
// kit and swaps slot in as children.
export function GrowPanel({ app, status, credits, preview = false, children }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [when, setWhen] = useState("");

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  }

  const launchState = status.launch;
  const boostedUntil = status.boostedUntil;

  return (
    <section aria-label="Grow" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <p className="font-mono text-[10.5px] tracking-widest text-muted uppercase">
        {preview ? "Builder tools · preview in demo mode" : "Only you see this"}
      </p>
      <h2 className="display mt-1 text-4xl">Grow {app.name}</h2>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-bg/50 p-4">
          <h3 className="display text-2xl">Launch day</h3>
          {launchState === "none" && (
            <>
              <p className="mt-1 text-sm text-muted">
                Pick a day. It shows up under Launching soon with a countdown, then sits in the Featured row for 24 hours.
                Free, once per app.
              </p>
              <form
                className="mt-3 flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!when) return setError("Pick a date and time.");
                  run(() => scheduleLaunch(app.id, app.slug, new Date(when).toISOString()));
                }}
              >
                <input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  aria-label="Launch date and time"
                  className="field w-auto flex-1"
                />
                <button className="btn-accent" disabled={pending}>
                  Schedule
                </button>
              </form>
            </>
          )}
          {launchState === "upcoming" && (
            <>
              <p className="mt-1 text-sm">
                Launching in <Countdown to={app.launch_at!} className="font-mono font-bold text-accent" />.
              </p>
              <button
                type="button"
                className="mt-3 text-sm text-muted hover:text-danger"
                disabled={pending}
                onClick={() => run(() => cancelLaunch(app.id, app.slug))}
              >
                Cancel launch
              </button>
            </>
          )}
          {launchState === "live" && (
            <p className="mt-1 text-sm">
              It&apos;s launch day! You&apos;re in the Featured row for another{" "}
              <Countdown to={status.launchEnds!} className="font-mono font-bold text-accent" />.
              Share your link everywhere.
            </p>
          )}
          {launchState === "done" && <p className="mt-1 text-sm text-muted">{app.name} has had its launch day.</p>}
        </div>

        <div className="rounded-lg border border-line bg-bg/50 p-4">
          <h3 className="display text-2xl">Boost</h3>
          <p className="mt-1 text-sm text-muted">
            {boostedUntil ? (
              <>
                Boosted for another <Countdown to={boostedUntil} className="font-mono font-bold text-accent" />. Boosting
                again adds more days.
              </>
            ) : (
              <>Put {app.name} in the Featured row with a Boosted label. ⚡{BOOST.perDay} a day.</>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {BOOST.options.map((days) => {
              const cost = days * BOOST.perDay;
              return (
                <button
                  key={days}
                  type="button"
                  className="btn-ghost"
                  disabled={pending || credits < cost}
                  onClick={() => run(() => boostApp(app.id, app.slug, days))}
                >
                  {days} {days === 1 ? "day" : "days"} · ⚡{cost}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">You have ⚡{credits}.</p>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {children}
    </section>
  );
}
