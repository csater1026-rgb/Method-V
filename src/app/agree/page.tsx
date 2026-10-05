import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/SignOutButton";
import { hasAgreedToTerms, safeNextPath } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

import { AgreeForm } from "./AgreeForm";

export const metadata: Metadata = { title: "One more step" };

// Shown once, after the first sign-in, to anyone who hasn't agreed to the
// Terms yet: people who signed up with Google, Apple or GitHub (they never
// saw the sign-up box), and accounts from before it existed.
export default async function AgreePage({ searchParams }: PageProps<"/agree">) {
  const params = await searchParams;
  const raw = safeNextPath(typeof params.next === "string" ? params.next : null);
  const next = raw.startsWith("/agree") ? "/" : raw;

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) redirect("/login");
    if (hasAgreedToTerms(data.user.user_metadata)) redirect(next);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-10 sm:py-16">
      <p className="eyebrow">Welcome to Method V</p>
      <h1 className="display rise mt-1 text-6xl">One more step</h1>
      <p className="mt-2 text-muted">
        Before you start, please read and agree to how Method V works: the rules, Methodium, payments, and what we do with your data.
      </p>
      <AgreeForm next={next} />
      <div className="mt-6 text-center">
        <SignOutButton className="text-sm text-muted hover:text-ink" />
      </div>
    </div>
  );
}
