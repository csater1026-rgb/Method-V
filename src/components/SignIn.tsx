"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { signInWithProvider } from "@/app/actions";
import { LoginForm } from "@/app/login/LoginForm";
import { authProviders, isSupabaseConfigured } from "@/lib/supabase/env";

// Sign in only when it's needed: liking, following, voting or posting while
// signed out opens this sheet over the page instead of leaving it, and
// signing in brings you back to the same spot.

type Ask = (reason?: string, next?: string) => void;
const SignInContext = createContext<Ask>(() => {});

export function useSignIn(): Ask {
  return useContext(SignInContext);
}

export function SignInProvider({ children }: { children: React.ReactNode }) {
  const [sheet, setSheet] = useState<{ reason: string; next: string } | null>(null);

  const ask = useCallback<Ask>(
    (reason = "join in", next) => {
      setSheet({ reason, next: next ?? `${window.location.pathname}${window.location.search}` });
    },
    [],
  );

  return (
    <SignInContext.Provider value={ask}>
      {children}
      {sheet && <SignInSheet reason={sheet.reason} next={sheet.next} onClose={() => setSheet(null)} />}
    </SignInContext.Provider>
  );
}

function SignInSheet({ reason, next, onClose }: { reason: string; next: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign in"
        onClick={(e) => e.stopPropagation()}
        className="rise w-full max-w-sm rounded-t-2xl border border-line bg-bg p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="display text-4xl">Sign in to {reason}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="btn-ghost px-3">
            ✕
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">Free. You&apos;ll come right back here.</p>
        <ProviderButtons next={next} />
        <LoginForm next={next} disabled={!isSupabaseConfigured} />
      </div>
    </div>
  );
}

// "Continue with GitHub / Google", when they're turned on.
export function ProviderButtons({ next }: { next: string }) {
  if (!isSupabaseConfigured || authProviders.length === 0) return null;
  return (
    <form action={signInWithProvider} className="mt-4 flex flex-col gap-2">
      <input type="hidden" name="next" value={next} />
      {authProviders.map((p) => (
        <button key={p} name="provider" value={p} className="btn-ghost w-full py-2.5">
          Continue with {p === "github" ? "GitHub" : "Google"}
        </button>
      ))}
      <p className="mt-1 text-center font-mono text-[10.5px] tracking-widest text-muted uppercase">or use your email</p>
    </form>
  );
}
