"use client";

import { useEffect } from "react";

import { PixelCoder } from "@/components/PixelCoder";

// Shown when a page hits an error while loading, instead of the browser's
// plain error screen. The code matches the error in Vercel's logs.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <PixelCoder size={120} title="A pixel builder fixing a bug" />
      <h1 className="display text-5xl">This page hit a snag</h1>
      <p className="text-muted">Something went wrong loading it. Trying again usually works.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="btn-accent" onClick={() => reset()}>
          Try again
        </button>
        {/* A full page load on purpose, in case the app's own navigation is what broke. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="btn-ghost">
          Go home
        </a>
      </div>
      {error.digest && <p className="font-mono text-xs text-muted">Error code: {error.digest}</p>}
    </div>
  );
}
