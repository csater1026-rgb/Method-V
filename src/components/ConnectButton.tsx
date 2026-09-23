"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removeConnection, requestConnection, respondConnection } from "@/app/actions";
import { CONNECT_REASONS, labelFor } from "@/lib/constants";
import type { ConnectionState } from "@/lib/types";

import { useSignIn } from "./SignIn";

// Connect with a reason: tap Connect, pick why, add a note if you like, send.
// Once connected it becomes a Message button.
export function ConnectButton({
  profileId,
  username,
  initial,
  signedIn,
}: {
  profileId: string;
  username: string;
  initial: ConnectionState;
  signedIn: boolean;
}) {
  const router = useRouter();
  const signIn = useSignIn();
  const [state, setState] = useState<ConnectionState>(initial);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await requestConnection(profileId, reason, note);
      if (!result.ok) return setError(result.error);
      setOpen(false);
      setState(result.accepted ? { status: "connected", id: "" } : { status: "sent", id: "" });
      router.refresh();
    });
  }

  if (state.status === "connected") {
    return (
      <Link href={`/inbox/${username}`} className="btn-accent">
        Message
      </Link>
    );
  }

  if (state.status === "received") {
    const id = state.id;
    return (
      <span className="flex flex-col items-start gap-1">
        <span className="flex gap-2">
          <button
            type="button"
            className="btn-accent"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await respondConnection(id, true);
                if (result.ok) setState({ status: "connected", id });
                else setError(result.error);
              })
            }
          >
            Accept · {labelFor(CONNECT_REASONS, state.reason)}
          </button>
        </span>
        {state.note && <span className="max-w-xs text-xs text-muted">“{state.note}”</span>}
        {error && <span className="text-xs text-danger">{error}</span>}
      </span>
    );
  }

  if (state.status === "sent" || state.status === "declined") {
    return (
      <span className="flex items-center gap-2">
        <span className="btn-ghost cursor-default opacity-70">Requested</span>
        {state.status === "sent" && state.id && (
          <button
            type="button"
            className="text-xs text-muted hover:text-danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if ((await removeConnection(state.id)).ok) setState({ status: "none" });
              })
            }
          >
            Withdraw
          </button>
        )}
      </span>
    );
  }

  return (
    <span className="relative">
      <button
        type="button"
        className="btn-ghost"
        aria-expanded={open}
        onClick={() => (signedIn ? setOpen((o) => !o) : signIn("connect"))}
      >
        Connect
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Connect"
          className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-4 text-left shadow-xl"
        >
          <p className="text-sm font-semibold">Why do you want to connect?</p>
          <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Reason">
            {CONNECT_REASONS.map((r) => (
              <button
                key={r.slug}
                type="button"
                role="radio"
                aria-checked={reason === r.slug}
                onClick={() => setReason(r.slug)}
                className={`rounded-md border px-2.5 py-1.5 text-sm ${
                  reason === r.slug ? "border-accent bg-accent text-accent-ink" : "border-line hover:border-muted"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={280}
            rows={2}
            placeholder="Add a note (optional)"
            aria-label="Note"
            className="field mt-3 resize-none"
          />
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-accent" disabled={pending || !reason} onClick={send}>
              {pending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
