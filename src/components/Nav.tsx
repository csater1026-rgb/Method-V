import Link from "next/link";

import { signOut } from "@/app/actions";
import { getViewer } from "@/lib/data";

import { Avatar } from "./Avatar";
import { NavLinks } from "./NavLinks";

export async function Nav() {
  const viewer = await getViewer();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <Link href="/" className="flex shrink-0 items-center gap-1.5 text-base font-black tracking-tight sm:text-lg">
          Method <span className="rounded-md bg-accent px-1.5 text-accent-ink">V</span>
        </Link>

        <NavLinks />

        <div className="ml-auto flex items-center gap-2">
          <Link href="/submit" className="btn-accent hidden sm:inline-flex">
            Post a Drop
          </Link>
          <Link
            href="/submit"
            aria-label="Post a Drop"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xl leading-none font-bold text-accent-ink sm:hidden"
          >
            +
          </Link>
          {viewer ? (
            <>
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
  );
}
