"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The header's Sign in button, hidden on the sign-in page itself (the form
// is already right there).
export function SignInLink() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  return (
    <Link href="/login" className="btn-ghost px-3 whitespace-nowrap sm:px-4">
      Sign in
    </Link>
  );
}
