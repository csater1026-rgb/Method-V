"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { checkUsername, saveWelcome, skipWelcome } from "@/app/actions";
import { USERNAME_HINT, USERNAME_PATTERN } from "@/lib/username";

type Check = { state: "idle" | "checking" | "ok" | "bad"; message: string };

export function WelcomeForm({ suggestion, name, next }: { suggestion: string; name: string; next: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(suggestion);
  const [displayName, setDisplayName] = useState(name);
  const [result, setResult] = useState<{ value: string; ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const value = username.trim().toLowerCase();
  const shapeOk = USERNAME_PATTERN.test(value);

  // Asks whether it's free a moment after they stop typing.
  useEffect(() => {
    if (!shapeOk) return;
    let stale = false;
    const t = setTimeout(async () => {
      const r = await checkUsername(value);
      if (!stale) setResult({ value, ok: r.ok, message: r.ok ? `@${value} is yours if you want it.` : r.error });
    }, 400);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [value, shapeOk]);

  const check: Check = !value
    ? { state: "idle", message: "" }
    : !shapeOk
      ? { state: "bad", message: `Usernames are ${USERNAME_HINT}` }
      : result?.value === value
        ? { state: result.ok ? "ok" : "bad", message: result.message }
        : { state: "checking", message: "Checking…" };

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await saveWelcome(username, displayName);
      if (!r.ok) return setError(r.error);
      router.push(next);
      router.refresh();
    });
  }

  function later() {
    startTransition(async () => {
      await skipWelcome();
      router.push(next);
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="mt-6 flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Username</span>
        <span className="flex items-center rounded-lg border border-line bg-surface focus-within:border-accent">
          <span className="pl-3 font-mono text-muted" aria-hidden>
            @
          </span>
          <input
            id="welcome-username"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={24}
            required
            placeholder="your_name"
            aria-describedby="welcome-username-check"
            className="w-full bg-transparent py-2.5 pr-3 pl-1 font-mono outline-none"
          />
        </span>
        <span
          id="welcome-username-check"
          aria-live="polite"
          className={`min-h-5 text-sm ${check.state === "ok" ? "text-accent" : check.state === "bad" ? "text-danger" : "text-muted"}`}
        >
          {check.message || USERNAME_HINT}
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Your name</span>
        <input
          id="welcome-name"
          name="display_name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={60}
          autoComplete="name"
          placeholder="Maya Chen"
          className="rounded-lg border border-line bg-surface px-3 py-2.5 outline-none focus:border-accent"
        />
        <span className="text-sm text-muted">Optional. Shown above your username.</span>
      </label>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-accent px-6 py-3 text-base" disabled={pending || check.state === "bad" || check.state === "checking" || !username.trim()}>
          {pending ? "Saving…" : "Save and continue"}
        </button>
        <button type="button" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline" disabled={pending} onClick={later}>
          Skip for now
        </button>
      </div>
    </form>
  );
}
