"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActive } from "./NavLinks";

const ICONS: Record<string, React.ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />,
  drops: <path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3 5v6l5-3z" />,
  test: <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M7.5 14h9" />,
  me: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0" />,
};

// Bottom tab bar on phones, like TikTok. Its height is --tabbar in globals.css.
export function MobileTabs({ profileHref }: { profileHref: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/", label: "Home", icon: "home" },
    { href: "/drops", label: "Drops", icon: "drops" },
    { href: "/submit", label: "Post", icon: "post" },
    { href: "/test", label: "Test", icon: "test" },
    { href: profileHref, label: "Me", icon: "me" },
  ];

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[var(--tabbar)] items-start justify-around border-t border-line bg-bg/95 pt-1.5 backdrop-blur sm:hidden"
    >
      {tabs.map((tab) => {
        const active = isActive(pathname, tab.href);
        if (tab.icon === "post") {
          return (
            <Link
              key={tab.label}
              href={tab.href}
              aria-label="Post a Drop"
              className="flex h-9 w-12 -skew-x-6 items-center justify-center rounded-md bg-accent text-2xl leading-none font-bold text-accent-ink shadow-[0_3px_0_0_var(--accent-edge)] active:translate-y-px"
            >
              +
            </Link>
          );
        }
        return (
          <Link
            key={tab.label}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex w-14 flex-col items-center gap-0.5 text-[11px] font-semibold ${active ? "text-accent" : "text-muted"}`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {ICONS[tab.icon]}
            </svg>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
