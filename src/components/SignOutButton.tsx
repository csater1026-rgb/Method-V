"use client";

import { useTransition } from "react";

import { signOut, unregisterWebPush } from "@/app/actions";

// Signing out also stops this browser's notifications, so the next person on
// this computer or phone doesn't get yours.
async function forgetBrowserPush() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager?.getSubscription();
    if (!sub) return;
    await unregisterWebPush(sub.endpoint);
    await sub.unsubscribe();
  } catch {
    // Never let this stop someone signing out.
  }
}

export function SignOutButton({ className = "btn-ghost" }: { className?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await forgetBrowserPush();
          await signOut();
        })
      }
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
