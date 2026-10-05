"use client";

import { useState } from "react";

import { REFERRALS } from "@/lib/constants";

import { Coin } from "./Coin";

// Your invite link. When a friend who joined with it posts their first Drop
// or earns their first feedback reward, you both get REFERRALS.bonus Methodium.
export function InviteCard({ link, joined, rewarded }: { link: string; joined: number; rewarded: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <section id="invite" aria-labelledby="invite-title" className="scroll-mt-24 rounded-xl border border-accent/60 bg-accent/10 p-5">
      <h2 id="invite-title" className="display text-4xl">
        Invite friends, both get <Coin className="inline" /> {REFERRALS.bonus}
      </h2>
      <p className="mt-1 text-sm text-muted">
        Share your link. When a friend who joins with it posts their first Drop or earns their first bounty reward, you each get{" "}
        {REFERRALS.bonus} Methodium.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-bg px-3 py-2 font-mono text-sm" aria-label="Your invite link">
          {link}
        </code>
        <button
          type="button"
          className="btn-accent"
          onClick={() => {
            void navigator.clipboard?.writeText(link).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <p className="mt-2 font-mono text-xs text-muted">
        {joined} joined · {rewarded} earned you the bonus · up to {REFERRALS.perMonth} a month
      </p>
    </section>
  );
}
