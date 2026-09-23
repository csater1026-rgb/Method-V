"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { addComment, deleteComment } from "@/app/actions";
import { timeAgo } from "@/lib/format";
import type { Comment } from "@/lib/types";

import { Avatar } from "./Avatar";

type Props = {
  dropId: string;
  appSlug: string;
  comments: Comment[];
  viewerId: string | null;
};

export function Comments({ dropId, appSlug, comments, viewerId }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const body = String(formData.get("body") ?? "");
    setError(null);
    startTransition(async () => {
      const result = await addComment(dropId, appSlug, body);
      if (result.ok) formRef.current?.reset();
      else setError(result.error);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteComment(id, appSlug);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <section id="comments" className="scroll-mt-20">
      <h2 className="text-lg font-bold">
        Comments <span className="text-muted">{comments.length}</span>
      </h2>

      {viewerId ? (
        <form ref={formRef} action={submit} className="mt-3 flex gap-2">
          <input
            name="body"
            required
            maxLength={500}
            placeholder="Say something nice, ask a question…"
            aria-label="Write a comment"
            className="field"
          />
          <button className="btn-accent" disabled={pending}>
            Post
          </button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted">
          <Link href={`/login?next=${encodeURIComponent(`/apps/${appSlug}#comments`)}`} className="underline hover:text-ink">
            Sign in
          </Link>{" "}
          to comment.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <ul className="mt-4 flex flex-col gap-4">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-3">
            <Link href={`/u/${c.user.username}`}>
              <Avatar username={c.user.username} name={c.user.display_name} size={32} />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <Link href={`/u/${c.user.username}`} className="font-semibold hover:underline">
                  @{c.user.username}
                </Link>{" "}
                <span className="text-xs text-muted" suppressHydrationWarning>
                  {timeAgo(c.created_at)}
                </span>
              </p>
              <p className="mt-0.5 text-sm break-words whitespace-pre-line text-ink/90">{c.body}</p>
              {viewerId === c.user.id && (
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  disabled={pending}
                  className="mt-1 text-xs text-muted hover:text-danger"
                >
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
