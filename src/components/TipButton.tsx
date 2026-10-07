"use client";

import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";

import { sendTip } from "@/app/actions";
import { TIPS } from "@/lib/constants";

import { Coin } from "./Coin";

// Send Methodium to someone: a builder whose app you love, or a tester whose
// feedback helped. 1 to 50 at a time, up to 50 a day, once your account is a
// week old.
export function TipButton({
  to,
  appId = null,
  label = "Tip",
  small = false,
}: {
  to: { id: string; username: string };
  appId?: string | null;
  label?: string;
  small?: boolean;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number>(TIPS.amounts[1]);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await sendTip(to.id, amount, appId, note, path);
      if (result.ok) {
        setSent(amount);
        setOpen(false);
        setNote("");
      } else setError(result.error);
    });
  }

  if (!open) {
    return (
      <span className="inline-flex flex-col">
        <button type="button" onClick={() => setOpen(true)} className={`btn-ghost ${small ? "px-3 py-1 text-xs" : ""}`}>
          <Coin /> {sent ? `Tipped ${sent}` : label}
        </button>
      </span>
    );
  }

  return (
    <div role="group" aria-label={`Tip @${to.username}`} className="flex w-full max-w-sm flex-col gap-2 rounded-lg border border-accent/60 bg-surface p-3 text-sm">
      <p className="font-semibold">
        Tip @{to.username} in Methodium
      </p>
      <div className="flex flex-wrap gap-1.5">
        {TIPS.amounts.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={amount === n}
            onClick={() => setAmount(n)}
            className={`rounded-md border px-3 py-1 font-mono text-sm ${amount === n ? "border-accent bg-accent text-accent-ink" : "border-line hover:border-accent"}`}
          >
            {n}
          </button>
        ))}
      </div>
      <input className="field" value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} placeholder="Say why (optional)" aria-label="Note" />
      <div className="flex gap-2">
        <button type="button" onClick={send} disabled={pending} className="btn-accent">
          {pending ? "Sending…" : `Send ${amount} Methodium`}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
          Cancel
        </button>
      </div>
      <p className="text-xs text-muted">Up to {TIPS.perDay} Methodium of tips a day, once your account is a week old.</p>
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}
