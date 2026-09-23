import type { Metadata } from "next";

import { PixelCoder } from "@/components/PixelCoder";

export const metadata: Metadata = { title: "Offline" };

// Shown by the service worker (public/sw.js) when a page can't load.
export default function OfflinePage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <PixelCoder size={120} title="A pixel builder waiting for the internet" />
      <h1 className="display text-5xl">You&apos;re offline</h1>
      <p className="text-muted">Method V needs a connection to load Drops. Check your signal and try again.</p>
      {/* A full page load on purpose: the app's own navigation can't work offline. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="btn-accent">
        Try again
      </a>
    </div>
  );
}
