"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const noSubscribe = () => () => {};

// Registers the service worker (production only), which is what lets Android
// offer "Install app".
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}

// "Install" on browsers that support it (Chrome, Edge, Android); step-by-step
// instructions on iPhone and iPad, where Safari has no install button.
export function InstallButton() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [done, setDone] = useState(false);
  const platform = useSyncExternalStore(
    noSubscribe,
    () => {
      if (window.matchMedia("(display-mode: standalone)").matches) return "installed";
      return /iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "other";
    },
    () => "unknown",
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    const onInstalled = () => setDone(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (platform === "installed" || done) {
    return <p className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">Method V is installed on this device. 🎉</p>;
  }
  if (prompt) {
    return (
      <button
        type="button"
        className="btn-accent px-6 py-3 text-base"
        onClick={async () => {
          await prompt.prompt();
          const choice = await prompt.userChoice;
          if (choice.outcome === "accepted") setDone(true);
          setPrompt(null);
        }}
      >
        Install Method V
      </button>
    );
  }
  return (
    <p className="text-sm text-muted" aria-live="polite">
      {platform === "ios"
        ? "On iPhone and iPad, use the steps below: Safari doesn't have an install button."
        : "If your browser doesn't offer an install button, use its menu (below)."}
    </p>
  );
}
