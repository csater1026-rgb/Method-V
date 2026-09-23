import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar } from "@/components/Avatar";
import { ConnectButton } from "@/components/ConnectButton";
import { ApplicationRow, ApplyForm, JobOpenToggle } from "@/components/Jobs";
import { RoleTags } from "@/components/Tags";
import { JOB_KINDS, labelFor } from "@/lib/constants";
import { getConnectionState, getJob, getMyApps, getViewer, isJobOpen } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function generateMetadata({ params }: PageProps<"/jobs/[id]">): Promise<Metadata> {
  const found = await getJob((await params).id, null);
  return { title: found ? found.job.title : "Post not found" };
}

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  const viewer = await getViewer();
  const found = await getJob(id, viewer);
  if (!found) notFound();
  const { job, applications, mine } = found;
  const isPoster = viewer?.id === job.user.id;
  const [myApps, connection] = await Promise.all([
    !isPoster && viewer ? getMyApps(viewer) : Promise.resolve([]),
    job.kind === "looking" && !isPoster ? getConnectionState(viewer, job.user.id) : Promise.resolve({ status: "none" as const }),
  ]);
  const open = isJobOpen(job);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/jobs" className="text-sm text-muted hover:text-ink">
        ← Jobs
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={job.kind === "looking" ? "tag" : "tag-accent"}>{labelFor(JOB_KINDS, job.kind)}</span>
        {job.remote && <span className="tag">Remote</span>}
        {job.status === "closed" && <span className="tag text-muted">Closed</span>}
      </div>
      <h1 className="display rise mt-3 text-6xl break-words sm:text-7xl">{job.title}</h1>
      {(job.pay || job.location) && (
        <p className="mt-2 font-mono text-sm text-muted">{[job.pay, job.location].filter(Boolean).join(" · ")}</p>
      )}
      <p className="mt-1 text-sm text-muted" suppressHydrationWarning>
        Posted {timeAgo(job.created_at)}
      </p>

      {job.body && <p className="mt-6 leading-relaxed whitespace-pre-line text-ink/90">{job.body}</p>}

      {job.skills.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-1.5">
          {job.skills.map((s) => (
            <Link key={s} href={`/jobs?skill=${encodeURIComponent(s)}`} className="tag hover:border-accent">
              {s}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4">
        <Link href={`/u/${job.user.username}`} className="flex items-center gap-3">
          <Avatar username={job.user.username} name={job.user.display_name} size={44} />
          <span>
            <span className="block font-semibold">{job.user.display_name || `@${job.user.username}`}</span>
            <span className="block text-sm text-muted">@{job.user.username}</span>
            <RoleTags roles={job.user.roles} className="mt-1" />
          </span>
        </Link>
        {job.app && (
          <Link href={`/apps/${job.app.slug}`} className="text-sm text-accent hover:underline">
            See {job.app.name} →
          </Link>
        )}
      </div>

      <div className="mt-6">
        {isPoster ? (
          <JobOpenToggle jobId={job.id} open={job.status === "open"} />
        ) : job.kind === "looking" ? (
          <div className="flex flex-wrap items-center gap-3">
            <ConnectButton profileId={job.user.id} username={job.user.username} initial={connection} signedIn={Boolean(viewer)} />
            <span className="text-sm text-muted">Pick “Hire” as your reason so they know why you&apos;re reaching out.</span>
          </div>
        ) : open ? (
          <ApplyForm jobId={job.id} myApps={myApps} signedIn={Boolean(viewer) || !isSupabaseConfigured} applied={mine} />
        ) : (
          <p className="text-sm text-muted">This post is closed.</p>
        )}
      </div>

      {isPoster && job.kind !== "looking" && (
        <section aria-label="Applications" className="mt-10">
          <h2 className="display text-4xl">
            Applications <span className="font-mono text-base text-muted">{applications.length}</span>
          </h2>
          <p className="mt-1 text-sm text-muted">Shortlisting someone connects you both, so you can message right away.</p>
          {applications.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No applications yet. Share the link to get some.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
              {applications.map((a) => (
                <ApplicationRow key={a.id} application={a} jobId={job.id} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
