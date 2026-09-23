"use client";

import { useState } from "react";

export function ShareButton({ path, title, layout = "rail" }: { path: string; title: string; layout?: "rail" | "inline" }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Closed the share sheet; fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      aria-label="Share"
      className={
        layout === "rail"
          ? "flex flex-col items-center gap-1 text-xs font-semibold text-ink drop-shadow"
          : "btn-ghost"
      }
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{copied ? "Copied!" : "Share"}</span>
    </button>
  );
}
