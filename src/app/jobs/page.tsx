import type { Metadata } from "next";
import Link from "next/link";

import { JobCard } from "@/components/JobCard";
import { JOB_KINDS } from "@/lib/constants";
import { getJobs, getMyJobs, getViewer } from "@/lib/data";

export const metadata: Metadata = { title: "Jobs" };

function jobsHref(kind?: string, skill?: string) {
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  if (skill) params.set("skill", skill);
  const qs = params.toString();
  return qs ? `/jobs?${qs}` : "/jobs";
}

// Where "Hiring" and "Looking for work" meet: jobs, gigs and people open to work.
export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  const params = await searchParams;
  const kind = typeof params.kind === "string" ? params.kind : undefined;
  const skill = typeof params.skill === "string" ? params.skill : undefined;
  const viewer = await getViewer();
  const [jobs, mine] = await Promise.all([getJobs({ kind, skill }), getMyJobs(viewer)]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Get hired · hire builders</p>
          <h1 className="display rise mt-1 text-6xl sm:text-7xl">Jobs</h1>
          <p className="mt-1 max-w-xl text-muted">
            Jobs and gigs from builders on Method V, and people looking for work. Every post links to real apps, so you can
            see what someone ships before you talk.
          </p>
        </div>
        <Link href="/jobs/new" className="btn-accent">
          Post a job
        </Link>
      </div>

      <nav aria-label="Kind" className="no-scrollbar -mx-4 mt-6 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {[{ slug: "", label: "All" }, ...JOB_KINDS].map((k) => {
          const active = (kind ?? "") === k.slug;
          return (
            <Link
              key={k.slug || "all"}
              href={jobsHref(k.slug || undefined, skill)}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-md border px-3 py-1.5 text-sm font-semibold ${
                active ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:text-ink"
              }`}
            >
              {k.label}
            </Link>
          );
        })}
      </nav>
      {skill && (
        <p className="mt-3 text-sm text-muted">
          Showing posts that need <strong className="text-ink">{skill}</strong>.{" "}
          <Link href={jobsHref(kind)} className="text-accent hover:underline">
            Clear
          </Link>
        </p>
      )}

      {jobs.length > 0 ? (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job, i) => (
            <JobCard key={job.id} job={job} index={i} />
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-muted">
          Nothing here yet.{" "}
          <Link href="/jobs/new" className="text-accent hover:underline">
            Post the first one
          </Link>
        </p>
      )}

      {mine.length > 0 && (
        <section aria-label="Your posts" className="mt-12">
          <h2 className="display text-4xl">Your posts</h2>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((job, i) => (
              <JobCard key={job.id} job={job} index={i} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
