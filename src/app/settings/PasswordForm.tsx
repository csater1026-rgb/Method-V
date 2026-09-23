"use client";

import { useState, useTransition } from "react";

import { setPassword } from "@/app/actions";
import { MIN_PASSWORD } from "@/lib/constants";

// Set or change your password. Also how "forgot password" ends: sign in with
// an emailed link, then pick a new one here.
export function PasswordForm() {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <section aria-label="Password" className="mt-10 rounded-xl border border-line bg-surface p-4">
      <h2 className="display text-3xl">Password</h2>
      <p className="mt-1 text-sm text-muted">Set a password to sign in with your email, on the website and in the app.</p>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          startTransition(async () => {
            const r = await setPassword(value);
            setMessage(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
            if (r.ok) setValue("");
          });
        }}
      >
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          minLength={MIN_PASSWORD}
          maxLength={72}
          autoComplete="new-password"
          aria-label="New password"
          placeholder={`New password (${MIN_PASSWORD}+ characters)`}
          className="field min-w-0 flex-1"
        />
        <button className="btn-ghost" disabled={pending || !value}>
          {pending ? "Saving…" : "Save password"}
        </button>
      </form>
      {message && <p className={`mt-2 text-sm ${message.ok ? "text-accent" : "text-danger"}`}>{message.text}</p>}
    </section>
  );
}
