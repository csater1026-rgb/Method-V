"use client";

import { usePathname } from "next/navigation";

import { TAGLINE } from "@/lib/constants";

import { PixelBot } from "./PixelBot";
import { PixelCoderDetailed } from "./PixelCoder";
import { Wordmark } from "./Wordmark";

// The bottom of every page (except the full-screen Drops feed): the logo and
// tagline, then the pixel builder in the bottom-left corner and the pixel AI
// computer in the bottom-right. The site's other links live on Browse.
export function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/drops")) return null;

  // Each piece takes at most 42% of a narrow phone, so both fit side by side.
  const size = "w-[min(160px,42vw)] sm:w-[220px]";
  return (
    <footer className="mt-16 border-t border-line">
      <div className="flex flex-col items-center gap-2 px-4 pt-10 pb-4 text-center">
        <p>
          <Wordmark className="text-3xl" />
        </p>
        <p className="font-mono text-[11px] tracking-widest text-muted uppercase">{TAGLINE}</p>
      </div>
      <div className="flex items-end justify-between px-2">
        <PixelCoderDetailed size={220} title="A pixel builder coding at their desk" className={`block h-auto ${size}`} />
        <PixelBot className={size} />
      </div>
    </footer>
  );
}
