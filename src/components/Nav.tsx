import Link from "next/link";

import { getInboxCounts, getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";

import { Avatar } from "./Avatar";
import { CreditsChip } from "./CreditsChip";
import { InboxIcon } from "./Inbox";
import { MobileTabs } from "./MobileTabs";
import { NavLinks } from "./NavLinks";
import { SignOutButton } from "./SignOutButton";
import { Tour } from "./Tour";
import { Wordmark } from "./Wordmark";
import { ThemeToggle } from "./ThemeToggle";

// Top bar on every screen size; on phones the page links move to the bottom tab bar.
export async function Nav() {
  const viewer = await getViewer();
  const counts = await getInboxCounts(viewer);
  // Signed out on the live site: only the welcome page is open, so no menu.
  const gated = isSupabaseConfigured && !viewer;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:gap-3 sm:px-4">
          <Link href="/" aria-label="Method V home" className="flex shrink-0 items-center">
            <Wordmark className="text-[20px] sm:text-[22px]" />
          </Link>

          {!gated && <NavLinks profileHref={viewer ? `/u/${viewer.username}` : "/login"} />}

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {!gated && (
              <Link href="/submit" data-tour="post" className="btn-accent hidden sm:inline-flex">
                Post a Drop
              </Link>
            )}
            {viewer ? (
              <>
                <CreditsChip credits={viewer.credits} />
                <InboxIcon count={counts.notifications + counts.messages + counts.requests} />
                <Link href={`/u/${viewer.username}`} aria-label="Your profile" data-tour="profile">
                  <Avatar username={viewer.username} src={viewer.avatar_url} size={32} />
                </Link>
                <span className="hidden sm:block">
                  <SignOutButton className="text-sm text-muted hover:text-ink" />
                </span>
              </>
            ) : (
              <Link href="/login" className="btn-ghost px-3 whitespace-nowrap sm:px-4">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      {!gated && <MobileTabs profileHref={viewer ? `/u/${viewer.username}` : "/login"} canPost={Boolean(viewer) || !isSupabaseConfigured} />}
      {!gated && <Tour userId={viewer?.id ?? null} />}
    </>
  );
}
