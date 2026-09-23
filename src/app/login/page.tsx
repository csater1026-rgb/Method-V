import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";

import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
  if (await getViewer()) redirect(safeNext);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <h1 className="display rise text-6xl">Sign in to Method V</h1>
      <p className="mt-2 text-muted">We&apos;ll email you a link. No password needed. New here? The same link creates your account.</p>
      {params.error === "link" && (
        <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
          That sign-in link didn&apos;t work or has expired. Request a new one.
        </p>
      )}
      <LoginForm next={safeNext} disabled={!isSupabaseConfigured} />
    </div>
  );
}
