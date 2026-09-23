"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { applyToJob, postJob, respondApplication, setJobOpen, withdrawApplication } from "@/app/actions";
import { JOB_KINDS } from "@/lib/constants";
import type { JobApplication } from "@/lib/types";

import { Avatar } from "./Avatar";
import { useSignIn } from "./SignIn";

type MyApp = { id: string; name: string };

const KIND_HELP: Record<string, string> = {
  hiring: "A job at your company or project.",
  gig: "A paid one-off: a landing page, a bug bash, a logo.",
  looking: "You're looking for work. People reach out by connecting.",
};

// Post to the jobs board: pick a kind, a title, and optionally the rest.
export function JobForm({ myApps }: { myApps: MyApp[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<string>("hiring");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-6 flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const get = (k: string) => String(f.get(k) ?? "");
        setError(null);
        startTransition(async () => {
          const result = await postJob({
            kind,
            title: get("title"),
            body: get("body"),
            pay: get("pay"),
            location: get("location"),
            remote: f.get("remote") === "on",
            skills: get("skills"),
            appId: get("app") || null,
          });
          if (!result.ok) return setError(result.error);
          router.push(result.id ? `/jobs/${result.id}` : "/jobs");
        });
      }}
    >
      <fieldset>
        <legend className="text-sm font-semibold">What is it?</legend>
        <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind">
          {JOB_KINDS.map((k) => (
            <button
              key={k.slug}
              type="button"
              role="radio"
              aria-checked={kind === k.slug}
              onClick={() => setKind(k.slug)}
              className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                kind === k.slug ? "border-accent bg-accent text-accent-ink" : "border-line hover:border-muted"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">{KIND_HELP[kind]}</p>
      </fieldset>

      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Title
        <input
          name="title"
          required
          minLength={5}
          maxLength={80}
          className="field font-normal"
          placeholder={kind === "looking" ? "Designer who ships React, open to part-time" : "Front-end developer (React)"}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        <span>
          Details <span className="font-normal text-muted">(optional)</span>
        </span>
        <textarea name="body" rows={5} maxLength={2000} className="field font-normal" placeholder="What you'd be doing, who you're looking for, how to stand out." />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          <span>
            Pay <span className="font-normal text-muted">(optional)</span>
          </span>
          <input name="pay" maxLength={60} className="field font-normal" placeholder="$60/hr, $800 fixed, equity…" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          <span>
            Location <span className="font-normal text-muted">(optional)</span>
          </span>
          <input name="location" maxLength={60} className="field font-normal" placeholder="Berlin" />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="remote" defaultChecked className="h-4 w-4 accent-[var(--color-accent)]" />
        Remote is fine
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        <span>
          Skills <span className="font-normal text-muted">(comma separated, up to 8)</span>
        </span>
        <input name="skills" className="field font-normal" placeholder="React, Supabase, Figma" />
      </label>

      {myApps.length > 0 && (
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          <span>
            Link one of your apps <span className="font-normal text-muted">(optional)</span>
          </span>
          <select name="app" className="field font-normal" defaultValue="">
            <option value="">None</option>
            {myApps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <button className="btn-accent self-start px-6 py-3 text-base" disabled={pending}>
        {pending ? "Posting…" : "Post it"}
      </button>
    </form>
  );
}

// Apply with a short note and, if you like, one of your apps as proof.
export function ApplyForm({
  jobId,
  myApps,
  signedIn,
  applied,
}: {
  jobId: string;
  myApps: MyApp[];
  signedIn: boolean;
  applied: JobApplication | null;
}) {
  const router = useRouter();
  const signIn = useSignIn();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [appId, setAppId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (applied || sent) {
    const status = applied?.status ?? "new";
    return (
      <div className="rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm">
        <p className="font-semibold">
          {status === "shortlisted" ? "You're shortlisted! You can message them now." : status === "passed" ? "They passed this time." : "Applied. They'll see your note."}
        </p>
        {status === "new" && (
          <button
            type="button"
            className="mt-2 text-xs text-muted hover:text-danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await withdrawApplication(jobId);
                if (r.ok) {
                  setSent(false);
                  router.refresh();
                } else setError(r.error);
              })
            }
          >
            Withdraw application
          </button>
        )}
        {error && <p className="mt-1 text-danger">{error}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn-accent px-6 py-3 text-base"
        onClick={() => (signedIn ? setOpen(true) : signIn("apply"))}
      >
        Apply
      </button>
    );
  }

  return (
    <form
      aria-label="Apply"
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await applyToJob(jobId, note, appId || null);
          if (r.ok) setSent(true);
          else setError(r.error);
        });
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Why you?
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={500}
          required
          className="field font-normal"
          placeholder="What you've shipped that's like this, and when you could start."
        />
      </label>
      {myApps.length > 0 && (
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          <span>
            Show one of your apps <span className="font-normal text-muted">(optional)</span>
          </span>
          <select value={appId} onChange={(e) => setAppId(e.target.value)} className="field font-normal">
            <option value="">None</option>
            {myApps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-accent" disabled={pending || !note.trim()}>
          {pending ? "Sending…" : "Send application"}
        </button>
        <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// What the poster sees for each application.
export function ApplicationRow({ application, jobId }: { application: JobApplication; jobId: string }) {
  const [status, setStatus] = useState(application.status);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const who = application.user;

  function respond(shortlist: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await respondApplication(application.id, jobId, shortlist);
      if (r.ok) setStatus(shortlist ? "shortlisted" : "passed");
      else setError(r.error);
    });
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start">
      <Link href={`/u/${who.username}`} className="flex shrink-0 items-center gap-2 sm:w-44">
        <Avatar username={who.username} name={who.display_name} size={36} />
        <span className="min-w-0 text-sm">
          <span className="block truncate font-semibold">{who.display_name || `@${who.username}`}</span>
          <span className="block truncate text-xs text-muted">@{who.username}</span>
        </span>
      </Link>
      <div className="min-w-0 flex-1 text-sm">
        <p className="whitespace-pre-line">{application.note}</p>
        {application.app && (
          <Link href={`/apps/${application.app.slug}`} className="mt-1 inline-block text-accent hover:underline">
            Built {application.app.name} →
          </Link>
        )}
        {error && <p className="mt-1 text-danger">{error}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        {status === "shortlisted" ? (
          <Link href={`/inbox/${who.username}`} className="btn-accent">
            Message
          </Link>
        ) : status === "passed" ? (
          <span className="tag">Passed</span>
        ) : (
          <>
            <button type="button" className="btn-accent" disabled={pending} onClick={() => respond(true)}>
              Shortlist
            </button>
            <button type="button" className="btn-ghost" disabled={pending} onClick={() => respond(false)}>
              Pass
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export function JobOpenToggle({ jobId, open }: { jobId: string; open: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        className="btn-ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await setJobOpen(jobId, !open);
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
      >
        {open ? "Close post" : "Reopen post"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
