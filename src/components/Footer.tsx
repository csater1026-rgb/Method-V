"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { TAGLINE } from "@/lib/constants";

import { PixelCoderDetailed } from "./PixelCoder";
import { Wordmark } from "./Wordmark";

// The masthead at the bottom of every page (except the full-screen Drops feed).
export function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/drops")) return null;

  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 pt-10 pb-4 text-center">
        <p>
          <Wordmark className="text-3xl" />
        </p>
        <p className="font-mono text-[11px] tracking-widest text-muted uppercase">{TAGLINE}</p>
        <nav aria-label="Footer" className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted">
          <Link href="/" className="hover:text-ink">Home</Link>
          <Link href="/drops" className="hover:text-ink">Drops</Link>
          <Link href="/browse" className="hover:text-ink">Browse</Link>
          <Link href="/test" className="hover:text-ink">Test &amp; earn</Link>
          <Link href="/credits" className="hover:text-ink">Credits</Link>
          <Link href="/jobs" className="hover:text-ink">Jobs</Link>
          <Link href="/challenges" className="hover:text-ink">Challenges</Link>
          <Link href="/earn" className="hover:text-ink">Earn</Link>
          <Link href="/pro" className="hover:text-ink">Pro</Link>
          <Link href="/brands" className="hover:text-ink">Brands</Link>
          <Link href="/developers" className="hover:text-ink">Developers</Link>
          <Link href="/app" className="hover:text-ink">Get the app</Link>
        </nav>
      </div>
      {/* The pixel builder, in the very bottom-left corner of the site. */}
      <div className="flex justify-start pl-2">
        <PixelCoderDetailed size={220} title="A pixel builder coding at their desk" className="block h-auto w-[160px] sm:w-[220px]" />
      </div>
    </footer>
  );
}
