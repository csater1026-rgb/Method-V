"use client";

import { useActionState, useState } from "react";

import { passwordAuth, signIn, type SignInState } from "@/app/actions";
import { MIN_PASSWORD } from "@/lib/constants";

type Mode = "signin" | "signup" | "link";

// Email + password (sign in or create an account), with an emailed sign-in
// link for anyone who'd rather not use a password or forgot theirs.
export function LoginForm({ next, disabled }: { next: string; disabled: boolean }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [passwordState, passwordAction, passwordPending] = useActionState<SignInState, FormData>(passwordAuth, { status: "idle" });
  const [linkState, linkAction, linkPending] = useActionState<SignInState, FormData>(signIn, { status: "idle" });
  const [showPassword, setShowPassword] = useState(false);
  const state = mode === "link" ? linkState : passwordState;
  const pending = mode === "link" ? linkPending : passwordPending;

  if (state.status === "sent" || state.status === "confirm") {
    return (
      <p className="mt-6 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
        Check <strong>{state.email}</strong> for{" "}
        {state.status === "sent" ? "your sign-in link." : "a link to confirm your account. Then you're in."}
      </p>
    );
  }

  return (
    <div className="mt-5">
      {mode !== "link" && (
        <div role="tablist" aria-label="Sign in or create an account" className="flex rounded-lg border border-line p-1">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md py-2 text-sm font-semibold ${mode === m ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
      )}

      <form action={mode === "link" ? linkAction : passwordAction} className="mt-3 flex flex-col gap-3">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="mode" value={mode} />
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className="field" placeholder="you@example.com" />
        {mode !== "link" && (
          <>
            <label className="text-sm font-medium" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={mode === "signup" ? MIN_PASSWORD : undefined}
                maxLength={72}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="field pr-16"
                placeholder={mode === "signup" ? `${MIN_PASSWORD}+ characters` : ""}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-2 px-2 font-mono text-[11px] text-muted uppercase hover:text-ink"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </>
        )}
        <button className="btn-accent py-2.5" disabled={pending || disabled}>
          {pending
            ? "One moment…"
            : mode === "signin"
              ? "Sign in"
              : mode === "signup"
                ? "Create account"
                : "Email me a sign-in link"}
        </button>
        {disabled && <p className="text-sm text-muted">Sign-in is off in demo mode. Add Supabase keys to turn it on.</p>}
        {state.status === "error" && <p className="text-sm text-danger">{state.error}</p>}
      </form>

      <button type="button" onClick={() => setMode(mode === "link" ? "signin" : "link")} className="mt-3 w-full text-center text-sm text-accent hover:underline">
        {mode === "link" ? "Use a password instead" : "Forgot your password? Email me a sign-in link"}
      </button>
    </div>
  );
}
