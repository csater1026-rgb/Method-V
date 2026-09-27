import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { TAGLINE } from "@/lib/constants";
import { getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";

import { ProviderButtons } from "@/components/SignIn";

import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Log in or create an account",
  description: "Show off the app you built, get honest feedback from real people, and get traction. Post a 60-second Drop on Method V.",
};

// What Method V is for, builders first: show it off, hear what people think,
// get it in front of more of them.
const ABOUT = [
  { title: "Show off what you built", body: "Post your app with a 60-second Drop and a cover image. It goes in the feed, on Browse and on your profile." },
  { title: "Get real feedback", body: "Real people try your app and tell you what worked, what didn't and whether they'd use it. Not bots." },
  { title: "Get traction", body: "Pick up testers, followers and likes, land a Featured spot or the Spotlight, and take on sponsors." },
  { title: "Test and earn", body: "Try other people's apps, give honest feedback, and earn credits (called V Coin) to get testers for yours." },
];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
  if (await getViewer()) redirect(safeNext);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-10 sm:py-16">
      <section aria-label="Log in or create an account">
        <p className="eyebrow">{TAGLINE}</p>
        <h1 className="display rise mt-1 text-6xl">Show off what you built</h1>
        <p className="mt-2 text-ink/90">
          Method V is where builders post their apps, get honest feedback from real people, and get traction.
        </p>
        <h2 className="mt-6 text-lg font-semibold">Log in or create an account</h2>
        <p className="mt-1 text-sm text-muted">Method V is for members. Join free in a minute.</p>
        {params.deleted === "1" && (
          <p className="mt-4 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm">Your account has been deleted. Thanks for being part of Method V.</p>
        )}
        {params.error === "link" && (
          <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
            That sign-in link didn&apos;t work or has expired. Request a new one.
          </p>
        )}
        <ProviderButtons next={safeNext} />
        <LoginForm next={safeNext} disabled={!isSupabaseConfigured} />
        <p className="mt-4 text-xs text-muted">
          By signing in or creating an account, you agree to our{" "}
          <Link href="/terms" className="text-accent hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-accent hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </section>

      <section aria-label="Why builders use Method V" className="mt-12 border-t border-line pt-8">
        <h2 className="display text-3xl">Why builders use Method V</h2>
        <ul className="mt-4 flex flex-col gap-4">
          {ABOUT.map((item) => (
            <li key={item.title} className="flex gap-3">
              <span aria-hidden className="mt-1 h-2.5 w-2.5 shrink-0 rotate-45 bg-accent" />
              <div>
                <p className="font-semibold">{item.title}</p>
                <p className="text-sm text-muted">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
