"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LEGAL, TAGLINE } from "@/lib/constants";

import { Wordmark } from "./Wordmark";

// The bottom of every page (except the full-screen Drops feed): the logo and
// tagline, with the Terms, Privacy and Contact links. The site's other links
// live on Browse. (The animated pixel builder and pixel AI computer that sat
// in the corners here are off for now: PixelCoderDetailed and PixelBot.)
export function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/drops")) return null;

  return (
    <footer className="mt-16 border-t border-line">
      <div className="flex flex-col items-center gap-2 px-4 pt-10 pb-8 text-center">
        <p>
          <Wordmark className="text-3xl" />
        </p>
        <p className="font-mono text-[11px] tracking-widest text-muted uppercase">{TAGLINE}</p>
        <nav aria-label="Legal" className="mt-1 flex gap-4 text-xs text-muted">
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <a href={`mailto:${LEGAL.email}`} className="hover:text-ink">
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
