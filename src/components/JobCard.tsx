import Link from "next/link";

import { JOB_KINDS, labelFor } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import type { Job } from "@/lib/types";

import { Avatar } from "./Avatar";

export function JobCard({ job, index = 0 }: { job: Job; index?: number }) {
  return (
    <li className="rise" style={{ "--i": index } as React.CSSProperties}>
      <Link
        href={`/jobs/${job.id}`}
        className="flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-4 transition hover:border-accent"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={job.kind === "looking" ? "tag" : "tag-accent"}>{labelFor(JOB_KINDS, job.kind)}</span>
          {job.remote && <span className="tag">Remote</span>}
          {job.status === "closed" && <span className="tag text-muted">Closed</span>}
        </div>
        <h3 className="display text-3xl leading-none">{job.title}</h3>
        {(job.pay || job.location) && (
          <p className="font-mono text-xs text-muted">{[job.pay, job.location].filter(Boolean).join(" · ")}</p>
        )}
        {job.skills.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {job.skills.map((s) => (
              <span key={s} className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
                {s}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center gap-2 text-xs text-muted">
          <Avatar username={job.user.username} name={job.user.display_name} size={22} />
          <span className="truncate">{job.user.display_name || `@${job.user.username}`}</span>
          <span suppressHydrationWarning>· {timeAgo(job.created_at)}</span>
          {job.kind !== "looking" && job.application_count > 0 && (
            <span className="ml-auto font-mono">{job.application_count} applied</span>
          )}
        </div>
      </Link>
    </li>
  );
}
