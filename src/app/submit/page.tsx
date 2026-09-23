import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";

import { SubmitForm } from "./SubmitForm";

export const metadata: Metadata = { title: "Post a Drop" };

export default async function SubmitPage() {
  const viewer = await getViewer();
  if (isSupabaseConfigured && !viewer) redirect("/login?next=/submit");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-black tracking-tight">Post a Drop</h1>
      <p className="mt-1 text-muted">60 seconds. Then they try it. Show the problem, the wow moment and where to click.</p>
      {!isSupabaseConfigured && (
        <p className="mt-4 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted">
          You&apos;re in demo mode, so posting is off. You can still fill the form in to see how it works.{" "}
          <Link href="/" className="underline">
            Back to Drops
          </Link>
        </p>
      )}
      <SubmitForm userId={viewer?.id ?? null} />
    </div>
  );
}
