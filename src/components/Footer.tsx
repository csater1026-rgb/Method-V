"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PixelCoder } from "./PixelCoder";

// The masthead at the bottom of every page (except the full-screen Drops feed).
export function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/drops")) return null;

  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-10 text-center">
        <PixelCoder size={132} title="A pixel builder coding at their desk" />
        <p className="display text-4xl">
          Method <span className="inline-block -skew-x-12 bg-accent px-1.5 text-accent-ink">V</span>
        </p>
        <p className="font-mono text-[11px] tracking-widest text-muted uppercase">60 seconds. Then try it.</p>
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
    </footer>
  );
}
