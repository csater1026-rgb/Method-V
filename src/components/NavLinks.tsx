"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// "Profile" goes to your profile, or to sign in first.
// Challenges aren't in the menu: a running one shows as a banner on Home.
function pageLinks(profileHref: string): { href: string; label: string }[] {
  return [
    { href: "/", label: "Home" },
    { href: "/drops", label: "Drops" },
    { href: "/browse", label: "Browse" },
    { href: profileHref, label: "Profile" },
  ];
}

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

// Desktop page links. Phones use MobileTabs instead.
export function NavLinks({ profileHref }: { profileHref: string }) {
  const pathname = usePathname();
  return (
    <nav className="ml-2 hidden items-center gap-1 sm:flex">
      {pageLinks(profileHref).map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            data-tour={link.label.toLowerCase()}
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
