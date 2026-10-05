"use client";

import { useState, useTransition } from "react";

import { deleteMyAccount } from "@/app/actions";
import { confirmMatches } from "@/lib/account";

// Delete account, at the bottom of Edit profile. Hidden behind a button, then
// you type your username to confirm. Same rules as the app's button.
export function DeleteAccountForm({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = confirmMatches(typed, username);

  if (!open) {
    return (
      <section aria-label="Delete account" className="mt-10 border-t border-line pt-6">
        <button type="button" onClick={() => setOpen(true)} className="text-sm text-danger hover:underline">
          Delete account…
        </button>
      </section>
    );
  }

  return (
    <section aria-label="Delete account" className="mt-10 rounded-xl border border-danger/50 bg-danger/5 p-4">
      <h2 className="display text-3xl">Delete account</h2>
      <p className="mt-1 text-sm text-ink/90">This can&apos;t be undone. It permanently deletes:</p>
      <ul className="mt-2 ml-5 list-disc text-sm text-ink/90">
        <li>your profile, apps, Drops, questions, answers and messages;</li>
        <li>your Methodium, Pro, and any earnings not yet paid out.</li>
      </ul>
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const r = await deleteMyAccount(typed);
            if (!r.ok) setError(r.error);
          });
        }}
      >
        <label htmlFor="delete-confirm" className="text-sm font-medium">
          Type your username (<strong>{username}</strong>) to confirm
        </label>
        <input
          id="delete-confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="field"
        />
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={!matches || pending} className="rounded-lg bg-danger px-4 py-2 font-semibold text-white disabled:opacity-50">
            {pending ? "Deleting…" : "Delete my account"}
          </button>
          <button type="button" onClick={() => (setOpen(false), setTyped(""), setError(null))} className="btn-ghost">
            Cancel
          </button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </section>
  );
}
