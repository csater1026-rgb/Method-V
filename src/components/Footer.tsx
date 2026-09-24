"use client";

import { usePathname } from "next/navigation";

import { PixelCoderDetailed } from "./PixelCoder";
import { Wordmark } from "./Wordmark";

// The logo, then the pixel builder in the very bottom-left corner, at the
// bottom of every page (except the full-screen Drops feed). The site's other
// links live on Browse.
export function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/drops")) return null;

  return (
    <footer className="mt-16 border-t border-line">
      <p className="flex justify-center px-4 pt-10 pb-4">
        <Wordmark className="text-3xl" />
      </p>
      <div className="flex justify-start pl-2">
        <PixelCoderDetailed size={220} title="A pixel builder coding at their desk" className="block h-auto w-[160px] sm:w-[220px]" />
      </div>
    </footer>
  );
}
