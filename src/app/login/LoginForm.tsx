"use client";

import { useActionState } from "react";

import { signIn, type SignInState } from "@/app/actions";

export function LoginForm({ next, disabled }: { next: string; disabled: boolean }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, { status: "idle" });

  if (state.status === "sent") {
    return (
      <p className="mt-6 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
        Check <strong>{state.email}</strong> for your sign-in link.
      </p>
    );
  }

  return (
    <form action={action} className="mt-6 flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label className="text-sm font-medium" htmlFor="email">
        Email
      </label>
      <input id="email" name="email" type="email" required autoComplete="email" className="field" placeholder="you@example.com" />
      <button className="btn-accent py-2.5" disabled={pending || disabled}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
      {disabled && (
        <p className="text-sm text-muted">Sign-in is off in demo mode. Add Supabase keys to turn it on.</p>
      )}
      {state.status === "error" && <p className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}
