"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const PAGE_LINKS = [
  { href: "/", label: "Home" },
  { href: "/drops", label: "Drops" },
  { href: "/browse", label: "Browse" },
  { href: "/test", label: "Test & earn" },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

// Desktop page links. Phones use MobileTabs instead.
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="ml-2 hidden items-center gap-1 sm:flex">
      {PAGE_LINKS.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`px-3 py-1.5 text-sm font-semibold transition ${
              active ? "text-ink shadow-[inset_0_-2px_0_var(--color-accent)]" : "text-muted hover:text-ink"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
