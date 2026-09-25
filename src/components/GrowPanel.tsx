"use client";

import { useState, useTransition } from "react";

import Link from "next/link";

import { bookSpotlight, cancelLaunch, scheduleLaunch } from "@/app/actions";
import { SPOTLIGHT } from "@/lib/constants";
import type { AppStatus } from "@/lib/data";
import type { ActionResult } from "@/lib/types";

import { Countdown } from "./Countdown";

type Props = {
  app: { id: string; slug: string; name: string; launch_at: string | null };
  status: AppStatus;
  credits: number;
  // What a Spotlight costs this builder (less with Pro), and when one booked
  // now would start and whether that means waiting in line (null if the
  // database isn't updated yet).
  spotlightCost: number;
  nextSpotlight: { at: string; waits: boolean } | null;
  // Demo mode: shown to everyone as a preview; the buttons explain demo mode.
  preview?: boolean;
  children?: React.ReactNode;
};

// Builder-only tools on their own app page: launch day and the Spotlight. The
// share kit and swaps slot in as children.
export function GrowPanel({ app, status, credits, spotlightCost, nextSpotlight, preview = false, children }: Props) {
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
  const spotlightUntil = status.boostedUntil;
  const spotlightStarts = status.spotlightStarts;

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
          <h3 className="display text-2xl">Spotlight</h3>
          {spotlightUntil ? (
            <p className="mt-1 text-sm">
              {app.name} is in the Spotlight for another{" "}
              <Countdown to={spotlightUntil} className="font-mono font-bold text-accent" />.
            </p>
          ) : spotlightStarts ? (
            <p className="mt-1 text-sm">
              Booked! {app.name} goes into the Spotlight in{" "}
              <Countdown to={spotlightStarts} className="font-mono font-bold text-accent" /> for {SPOTLIGHT.days} days.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">
                One of {SPOTLIGHT.slots} spots in the Featured row for {SPOTLIGHT.days} days. First come, first served.
              </p>
              <p className="mt-1 text-sm">
                {nextSpotlight === null ? (
                  "The Spotlight needs the latest database update."
                ) : nextSpotlight.waits ? (
                  <>
                    All {SPOTLIGHT.slots} spots are taken. Book now and you&apos;re next in line: starts in{" "}
                    <Countdown to={nextSpotlight.at} className="font-mono font-bold text-accent" />.
                  </>
                ) : (
                  "A spot is free: it starts right away."
                )}
              </p>
              <button
                type="button"
                className="btn-accent mt-3"
                disabled={pending || credits < spotlightCost || nextSpotlight === null}
                onClick={() => run(() => bookSpotlight(app.id, app.slug))}
              >
                Book the Spotlight · ⚡{spotlightCost}
              </button>
            </>
          )}
          <p className="mt-2 text-xs text-muted">
            You have ⚡{credits}.{" "}
            {!spotlightUntil && !spotlightStarts && credits < spotlightCost && (
              <Link href="/credits#buy" className="text-accent hover:underline">
                Get credits →
              </Link>
            )}
          </p>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {children}
    </section>
  );
}
