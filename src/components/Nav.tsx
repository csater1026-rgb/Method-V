import Link from "next/link";

import { signOut } from "@/app/actions";
import { getViewer } from "@/lib/data";

import { Avatar } from "./Avatar";
import { CreditsChip } from "./CreditsChip";
import { MobileTabs } from "./MobileTabs";
import { NavLinks } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";

// Top bar on every screen size; on phones the page links move to the bottom tab bar.
export async function Nav() {
  const viewer = await getViewer();

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:gap-3 sm:px-4">
          <Link href="/" aria-label="Method V home" className="display flex shrink-0 items-center gap-1 text-[27px]">
            Method
            <span className="inline-block -skew-x-12 bg-accent px-1.5 pt-0.5 text-accent-ink">V</span>
          </Link>

          <NavLinks />

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link href="/submit" className="btn-accent hidden sm:inline-flex">
              Post a Drop
            </Link>
            {viewer ? (
              <>
                <CreditsChip credits={viewer.credits} />
                <Link href={`/u/${viewer.username}`} aria-label="Your profile">
                  <Avatar username={viewer.username} size={32} />
                </Link>
                <form action={signOut} className="hidden sm:block">
                  <button className="text-sm text-muted hover:text-ink">Sign out</button>
                </form>
              </>
            ) : (
              <Link href="/login" className="btn-ghost px-3 whitespace-nowrap sm:px-4">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <MobileTabs profileHref={viewer ? `/u/${viewer.username}` : "/login"} />
    </>
  );
}
