import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";

import { ProviderButtons } from "@/components/SignIn";

import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Log in or create an account",
  description: "Method V: real apps, real builders, real feedback. Watch 60-second Drops, test apps and get feedback on yours.",
};

const ABOUT = [
  { title: "60-second Drops", body: "Swipe through short demos of apps people actually built, and try the ones you like." },
  { title: "Test and earn", body: "Give honest feedback on apps and earn credits and Tester Passport stamps." },
  { title: "Get real feedback", body: "Post your own app and hear from real testers, not bots." },
  { title: "Meet builders", body: "Follow people who build what you like, ask questions and connect." },
];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
  if (await getViewer()) redirect(safeNext);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-10 sm:py-16">
      <section aria-label="Log in or create an account">
        <p className="eyebrow">Real apps. Real builders. Real feedback.</p>
        <h1 className="display rise mt-1 text-6xl">Log in or create an account</h1>
        <p className="mt-2 text-muted">Method V is for members. Sign in to see the apps, or join free in a minute.</p>
        {params.error === "link" && (
          <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
            That sign-in link didn&apos;t work or has expired. Request a new one.
          </p>
        )}
        <ProviderButtons next={safeNext} />
        <LoginForm next={safeNext} disabled={!isSupabaseConfigured} />
      </section>

      <section aria-label="What's on Method V" className="mt-12 border-t border-line pt-8">
        <h2 className="display text-3xl">What&apos;s on Method V</h2>
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
