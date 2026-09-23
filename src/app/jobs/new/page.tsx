import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { JobForm } from "@/components/Jobs";
import { getMyApps, getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Post a job" };

export default async function NewJobPage() {
  const viewer = await getViewer();
  if (isSupabaseConfigured && !viewer) redirect("/login?next=/jobs/new");
  const myApps = await getMyApps(viewer);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/jobs" className="text-sm text-muted hover:text-ink">
        ← Jobs
      </Link>
      <h1 className="display rise mt-2 text-6xl">Post a job</h1>
      <p className="mt-1 text-muted">Free. Posts stay up for 30 days, and you can close them any time.</p>
      <JobForm myApps={myApps} />
    </div>
  );
}
