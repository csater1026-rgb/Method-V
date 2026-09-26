"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// The first-time tour: after someone signs in, Home walks them through the
// real page, highlighting each part in turn. Skip any time. Remembered per
// account on this browser; /?tour=1 (Edit profile → Take the tour again)
// plays it again.

type Step = { title: string; body: string; target?: string[] };

const STEPS: Step[] = [
  {
    title: "Welcome to Method V",
    body: "Real apps, real builders, real feedback. Here's a quick look around. It takes about 30 seconds.",
  },
  {
    title: "Featured",
    body: "Hand-picked apps, launches and Spotlight apps sit up top. Tap any card to open the app, try it and leave feedback.",
    target: ["featured"],
  },
  {
    title: "Drops",
    body: "Swipe through 60-second demos. For you learns what you like, and Questions is where builders ask the community.",
    target: ["drops"],
  },
  {
    title: "Post your app",
    body: "Share what you built with a 60-second Drop and get honest feedback from real testers.",
    target: ["post"],
  },
  {
    title: "Browse",
    body: "Search every app, filter by category or tech stack, and find people by name.",
    target: ["browse"],
  },
  {
    title: "V Coin",
    body: "Credits on Method V are called V Coin. Earn them by testing apps and giving feedback, then spend them on testers for your own app or a Spotlight spot on Featured.",
    target: ["credits"],
  },
  {
    title: "Your inbox",
    body: "Follows, feedback, questions and messages land here. You can also turn on notifications in Edit profile.",
    target: ["inbox"],
  },
  {
    title: "Your profile",
    body: "Your apps, your Tester Passport and your status. Add a photo, a bio and your socials in Edit profile.",
    target: ["profile", "me"],
  },
  {
    title: "You're all set",
    body: "Start by testing an app (and earning V Coin), or post your own.",
  },
];

const PAD = 6;
const doneKey = (userId: string | null) => `method-v-tour-done:${userId ?? "guest"}`;

// The first matching element that's actually on screen (phones and computers
// show different menus).
function findTarget(ids: string[] | undefined): HTMLElement | null {
  if (!ids) return null;
  for (const id of ids) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

export function Tour({ userId }: { userId: string | null }) {
  const pathname = usePathname();
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const nextRef = useRef<HTMLButtonElement>(null);

  // Start on Home: the first time for this account, or when asked to replay.
  useEffect(() => {
    if (pathname !== "/") return;
    const replay = new URLSearchParams(window.location.search).get("tour") === "1";
    let done = false;
    try {
      done = localStorage.getItem(doneKey(userId)) === "1";
    } catch {
      // Private browsing: show it, just don't remember.
    }
    if (!replay && (!userId || done)) return;
    const t = setTimeout(() => setStep(0), 500);
    return () => clearTimeout(t);
  }, [pathname, userId]);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(doneKey(userId), "1");
    } catch {
      // Nothing to remember it in.
    }
    if (new URLSearchParams(window.location.search).has("tour")) window.history.replaceState(null, "", "/");
    setStep(null);
  }, [userId]);

  const current = step === null ? null : STEPS[step];

  // Find, scroll to and measure what this step points at.
  useLayoutEffect(() => {
    if (!current) return;
    const el = findTarget(current.target);
    const measure = () => {
      setView({ w: window.innerWidth, h: window.innerHeight });
      setRect(el ? el.getBoundingClientRect() : null);
    };
    if (el) {
      // Only scroll when it's off screen or under the sticky header (the tab bar is always on screen).
      const r = el.getBoundingClientRect();
      if (r.top < 60 || r.bottom > window.innerHeight) el.scrollIntoView({ block: "center" });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    nextRef.current?.focus();
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [current]);

  // Keys: Esc skips, arrows move.
  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setStep((s) => (s === null ? s : Math.min(s + 1, STEPS.length - 1)));
      if (e.key === "ArrowLeft") setStep((s) => (s === null ? s : Math.max(s - 1, 0)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, finish]);

  if (step === null || !current) return null;
  const last = step === STEPS.length - 1;
  const hole = current.target && rect ? rect : null;

  // The card sits under the highlight, or above it when there's no room.
  const cardW = Math.min(360, view.w - 32);
  let cardStyle: React.CSSProperties = { width: cardW, left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  if (hole) {
    const left = Math.min(Math.max(hole.left + hole.width / 2 - cardW / 2, 16), view.w - cardW - 16);
    const below = hole.bottom + PAD + 12;
    cardStyle = view.h - below > 230 ? { width: cardW, left, top: below } : { width: cardW, left, bottom: view.h - hole.top + PAD + 12 };
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Tour" className="fixed inset-0 z-[60]">
      {/* The dim layer, with a window cut out around what's being shown. */}
      <svg aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" width={view.w} height={view.h}>
        <path
          fillRule="evenodd"
          fill="rgb(0 0 0 / 0.62)"
          d={
            `M0 0H${view.w}V${view.h}H0Z` +
            (hole ? ` M${hole.left - PAD} ${hole.top - PAD}h${hole.width + PAD * 2}v${hole.height + PAD * 2}h${-(hole.width + PAD * 2)}Z` : "")
          }
        />
      </svg>
      {hole && (
        <div
          aria-hidden
          data-tour-highlight
          className="pointer-events-none fixed rounded-lg border-2 border-accent"
          style={{ left: hole.left - PAD, top: hole.top - PAD, width: hole.width + PAD * 2, height: hole.height + PAD * 2 }}
        />
      )}
      {/* Clicks outside the card don't reach the page underneath. */}
      <div className="fixed inset-0" />

      <div className="rise fixed rounded-xl border border-line bg-surface p-4 shadow-2xl sm:p-5" style={cardStyle}>
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">
            {step === 0 ? "Quick tour" : last ? "Done" : `${step} of ${STEPS.length - 2}`}
          </p>
          <button type="button" onClick={finish} className="text-sm text-muted hover:text-ink">
            {last ? "Close" : "Skip tour"}
          </button>
        </div>
        <h2 className="display mt-1 text-3xl">{current.title}</h2>
        <p className="mt-1 text-sm text-ink/90">{current.body}</p>

        {/* Progress dots for the steps in between. */}
        {step > 0 && !last && (
          <div aria-hidden className="mt-3 flex gap-1">
            {STEPS.slice(1, -1).map((s, i) => (
              <span key={s.title} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-accent" : "bg-surface-2"}`} />
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {last ? (
            <>
              <Link href="/test" onClick={finish} className="btn-accent">
                Find apps to test
              </Link>
              <Link href="/submit" onClick={finish} className="btn-ghost">
                Post your app
              </Link>
            </>
          ) : (
            <>
              <button ref={nextRef} type="button" className="btn-accent" onClick={() => setStep(step + 1)}>
                {step === 0 ? "Start the tour" : "Next"}
              </button>
              {step > 0 && (
                <button type="button" className="btn-ghost" onClick={() => setStep(step - 1)}>
                  Back
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
