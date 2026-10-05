"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Promotion } from "@/lib/types";

import { Coin } from "./Coin";
import { TOUR_DONE_EVENT, tourDoneKey } from "./Tour";

// Remembers the promotion's end date, so closing it hides this run of the
// promotion for good, but a new run (a new end date) shows again.
const seenKey = (slug: string) => `method-v-promo-seen:${slug}`;

function endDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
}

// "Post a Drop, get +10 Methodium" as a pop-up the first time someone opens Home
// while the promotion runs (after the first-time tour, never on top of it).
// Post a Drop goes to the post page; ✕, Not now, Escape or a tap outside
// closes it.
export function DropBonusPopup({ promo, userId }: { promo: Promotion | null; userId: string | null }) {
  const [open, setOpen] = useState(false);
  const postRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!promo) return;
    let seen = false;
    let tourDone = true;
    try {
      seen = localStorage.getItem(seenKey(promo.slug)) === promo.ends_at;
      tourDone = !userId || localStorage.getItem(tourDoneKey(userId)) === "1";
    } catch {
      // Private browsing: show it, just don't remember.
    }
    if (seen) return;
    const replay = new URLSearchParams(window.location.search).get("tour") === "1";
    if (tourDone && !replay) {
      const t = setTimeout(() => setOpen(true), 700);
      return () => clearTimeout(t);
    }
    const show = () => setOpen(true);
    window.addEventListener(TOUR_DONE_EVENT, show);
    return () => window.removeEventListener(TOUR_DONE_EVENT, show);
  }, [promo, userId]);

  const close = useCallback(() => {
    if (promo) {
      try {
        localStorage.setItem(seenKey(promo.slug), promo.ends_at);
      } catch {
        // Nothing to remember it in.
      }
    }
    setOpen(false);
  }, [promo]);

  useEffect(() => {
    if (!open) return;
    postRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!promo || !open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drop-bonus-title"
        onClick={(e) => e.stopPropagation()}
        className="rise media-dark stage relative w-full max-w-md overflow-hidden rounded-t-2xl border border-accent/60 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-center text-white shadow-2xl sm:rounded-2xl"
      >
        <button type="button" onClick={close} aria-label="Close" className="absolute top-3 right-3 rounded-lg px-3 py-1.5 text-white/70 hover:bg-white/10 hover:text-white">
          ✕
        </button>
        <p className="eyebrow">For a limited time</p>
        <div className="mx-auto mt-3 flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-4xl ring-2 ring-accent/60">
          <Coin className="h-9 w-9" />
        </div>
        <h2 id="drop-bonus-title" className="display mt-3 text-5xl leading-none">
          Post a Drop, get +{promo.amount} Methodium
        </h2>
        <p className="mt-3 text-sm text-white/80">
          Share a 60-second demo of what you built and we&apos;ll add {promo.amount} Methodium to your account. Spend it on testers or a
          Spotlight spot at the top of Home.
        </p>
        <p className="mt-2 text-xs text-white/60">
          Until {endDate(promo.ends_at)}: one bonus per app, up to {promo.per_day} a day.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Link ref={postRef} href="/submit" onClick={close} className="btn-accent py-3 text-base">
            Post a Drop →
          </Link>
          <button type="button" onClick={close} className="py-2 text-sm text-white/70 hover:text-white">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
