"use client";

import { usePathname } from "next/navigation";

import { PixelCoderDetailed } from "./PixelCoder";

// The pixel builder in the very bottom-left corner of every page (except the
// full-screen Drops feed). The site's other links live on Browse.
export function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/drops")) return null;

  return (
    <footer className="mt-16 flex justify-start pl-2">
      <PixelCoderDetailed size={220} title="A pixel builder coding at their desk" className="block h-auto w-[160px] sm:w-[220px]" />
    </footer>
  );
}
