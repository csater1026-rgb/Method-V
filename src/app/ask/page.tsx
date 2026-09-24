import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getMyApps, getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";

import { AskAnywhere } from "./AskAnywhere";

export const metadata: Metadata = { title: "Ask a question" };

// Ask people about your app. It lands in the Questions tab in Drops and on
// your app's page.
export default async function AskPage() {
  const viewer = await getViewer();
  if (isSupabaseConfigured && !viewer) redirect("/login?next=/ask");
  const apps = await getMyApps(viewer);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <p className="eyebrow">Q&amp;A</p>
      <h1 className="display rise text-6xl">Ask a question</h1>
      <p className="mt-1 text-muted">
        Ask what you want to know about your app: what to build next, which design is better, what&apos;s confusing. Add a poll
        and people can answer with one tap. It shows up in the Questions tab in Drops.
      </p>
      {!isSupabaseConfigured ? (
        <p className="mt-6 rounded-lg border border-line bg-surface p-4 text-sm text-muted">
          Method V is running in demo mode, so asking is off. Browse the sample questions in{" "}
          <Link href="/drops?tab=questions" className="text-accent hover:underline">
            Drops → Questions
          </Link>
          .
        </p>
      ) : apps.length > 0 ? (
        <AskAnywhere apps={apps.map((a) => ({ id: a.id, slug: a.slug, name: a.name, owner_id: viewer!.id }))} />
      ) : (
        <p className="mt-6 rounded-lg border border-line bg-surface p-4 text-sm text-muted">
          Questions live on an app. Post yours first, or open any app and ask in its Q&amp;A.{" "}
          <Link href="/submit" className="text-accent hover:underline">
            Post a Drop →
          </Link>
        </p>
      )}
    </div>
  );
}
