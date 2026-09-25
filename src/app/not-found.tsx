import type { Metadata } from "next";
import Link from "next/link";

import { PixelCoder } from "@/components/PixelCoder";

export const metadata: Metadata = { title: "Not found" };

// A link to a profile, app or page that doesn't exist (or no longer does).
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <PixelCoder size={120} title="A pixel builder looking for a page" />
      <p className="eyebrow">404</p>
      <h1 className="display text-5xl">Nothing here</h1>
      <p className="text-muted">This page doesn&apos;t exist, or it was moved or deleted.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn-accent">
          Go home
        </Link>
        <Link href="/browse" className="btn-ghost">
          Browse apps
        </Link>
      </div>
    </div>
  );
}
