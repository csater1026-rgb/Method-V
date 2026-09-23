"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { deleteUpdate, postUpdate } from "@/app/actions";
import { timeAgo } from "@/lib/format";
import type { Update } from "@/lib/types";

import { Avatar } from "./Avatar";

type AppOption = { id: string; name: string };

// Build in public: a one-box composer (like posting a tweet) and the list.
export function Updates({
  updates,
  viewerId,
  composer,
  emptyText = "No updates yet.",
}: {
  updates: Update[];
  viewerId: string | null;
  // Show the composer: which apps to offer, and which one to preselect.
  composer?: { apps: AppOption[]; appId?: string } | null;
  emptyText?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {composer && <Composer apps={composer.apps} fixedAppId={composer.appId} />}
      {updates.length === 0 ? (
        <p className="text-sm text-muted">{emptyText}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
          {updates.map((u) => (
            <UpdateRow key={u.id} update={u} mine={u.user.id === viewerId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Composer({ apps, fixedAppId }: { apps: AppOption[]; fixedAppId?: string }) {
  const [body, setBody] = useState("");
  const [appId, setAppId] = useState(fixedAppId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);
  const left = 500 - body.length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await postUpdate(body, appId || null);
      if (result.ok) {
        setBody("");
        ref.current?.blur();
      } else setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-line bg-surface p-3">
      <textarea
        ref={ref}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="What did you ship today?"
        aria-label="Write an update"
        className="w-full resize-none bg-transparent text-[15px] outline-none placeholder:text-muted/70"
      />
      <div className="mt-2 flex items-center gap-2">
        {!fixedAppId && apps.length > 0 && (
          <select
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            aria-label="About which app"
            className="field w-auto py-1.5 text-xs"
          >
            <option value="">No app</option>
            {apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <span className={`ml-auto font-mono text-[11px] ${left < 40 ? "text-danger" : "text-muted"}`}>{left}</span>
        <button className="btn-accent px-4 py-1.5" disabled={pending || !body.trim()}>
          {pending ? "Posting…" : "Post"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </form>
  );
}

function UpdateRow({ update, mine }: { update: Update; mine: boolean }) {
  const [gone, setGone] = useState(false);
  const [pending, startTransition] = useTransition();
  if (gone) return null;

  return (
    <li className="flex gap-3 p-3 sm:p-4">
      <Link href={`/u/${update.user.username}`} className="shrink-0">
        <Avatar username={update.user.username} name={update.user.display_name} size={36} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <Link href={`/u/${update.user.username}`} className="font-semibold hover:underline">
            {update.user.display_name || `@${update.user.username}`}
          </Link>
          {update.app && (
            <Link href={`/apps/${update.app.slug}`} className="tag hover:border-accent">
              {update.app.name}
            </Link>
          )}
          <span className="text-xs text-muted" suppressHydrationWarning>
            {timeAgo(update.created_at)}
          </span>
        </p>
        <p className="mt-1 text-[15px] break-words whitespace-pre-line">{update.body}</p>
        {mine && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if ((await deleteUpdate(update.id)).ok) setGone(true);
              })
            }
            className="mt-1 text-xs text-muted hover:text-danger"
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}
