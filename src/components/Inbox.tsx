"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { markNotificationsRead, markThreadRead, removeConnection, respondConnection, sendMessage } from "@/app/actions";
import { CONNECT_REASONS, labelFor } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import type { ConnectionRequest, Message, Notification } from "@/lib/types";

import { Avatar } from "./Avatar";

// The inbox icon in the top bar, with one combined unread count.
export function InboxIcon({ count }: { count: number }) {
  return (
    <Link
      href="/inbox"
      aria-label={count ? `Inbox, ${count} new` : "Inbox"}
      className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface hover:border-accent"
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z M4 13h4.5l1 2h5l1-2H20" strokeLinejoin="round" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-heart px-1 font-mono text-[10px] font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

// What each notification says and where it goes.
function describe(n: Notification): { text: string; href: string } {
  const app = n.app?.name ?? "your app";
  const appHref = n.app ? `/apps/${n.app.slug}` : "/";
  const who = n.actor ? `/u/${n.actor.username}` : "/";
  switch (n.kind) {
    case "follow":
      return { text: "started following you", href: who };
    case "like":
      return { text: `liked your Drop for ${app}`, href: appHref };
    case "comment":
      return { text: `commented on ${app}`, href: `${appHref}#comments` };
    case "feedback":
      return { text: `left feedback on ${app}`, href: `${appHref}#feedback` };
    case "helpful":
      return { text: `marked your feedback on ${app} helpful`, href: appHref };
    case "connection_request":
      return { text: "wants to connect", href: "/inbox?tab=requests" };
    case "connection_accepted":
      return { text: "accepted your request to connect. Say hi!", href: n.actor ? `/inbox/${n.actor.username}` : "/inbox" };
    case "question":
      return { text: `asked a question about ${app}`, href: `${appHref}?tab=qa#qa` };
    case "answer":
      return { text: `answered your question about ${app}`, href: `${appHref}?tab=qa#qa` };
    case "best_answer":
      return { text: `picked your answer as the best on ${app}`, href: `${appHref}?tab=qa#qa` };
    case "swap_request":
      return { text: `wants to team up with ${app}`, href: "/swaps" };
    case "swap_accepted":
      return { text: `accepted your swap with ${app}`, href: "/swaps" };
    case "backed":
      return { text: `backed ${app}`, href: `${appHref}#backers` };
    case "sponsor_offer":
      return { text: `wants to sponsor ${app}`, href: "/earn" };
    case "sponsor_accepted":
      return { text: `accepted your sponsorship. Pay the budget to start.`, href: "/earn" };
    case "sponsor_started":
      return { text: `started sponsoring ${app}`, href: "/earn" };
    case "sponsor_ended":
      return { text: `ended your sponsorship deal`, href: "/earn" };
    case "job_application":
      // From the old jobs board; the post itself is gone.
      return { text: "applied to your post", href: n.actor ? `/u/${n.actor.username}` : "/inbox" };
    case "application_shortlisted":
      return { text: "shortlisted you. Say hi!", href: n.actor ? `/inbox/${n.actor.username}` : "/inbox" };
    default:
      return { text: "did something", href: "/" };
  }
}

export function ActivityList({ items }: { items: Notification[] }) {
  // Seeing the list marks everything read (the unread dots stay for this visit).
  useEffect(() => {
    if (items.some((n) => !n.read_at)) void markNotificationsRead();
  }, [items]);

  if (items.length === 0) {
    return <p className="mt-4 text-sm text-muted">Nothing yet. Likes, follows, feedback and answers show up here.</p>;
  }
  return (
    <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
      {items.map((n) => {
        const { text, href } = describe(n);
        return (
          <li key={n.id}>
            <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
              {n.actor ? (
                <Avatar username={n.actor.username} name={n.actor.display_name} src={n.actor.avatar_url} size={36} />
              ) : (
                <span className="h-9 w-9" />
              )}
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">{n.actor?.display_name || (n.actor ? `@${n.actor.username}` : "Someone")}</span>{" "}
                {text}
                <span className="block text-xs text-muted" suppressHydrationWarning>
                  {timeAgo(n.created_at)}
                </span>
              </span>
              {!n.read_at && <span className="h-2 w-2 rounded-full bg-accent" aria-label="New" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function RequestRow({ request, incoming }: { request: ConnectionRequest; incoming: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => ReturnType<typeof respondConnection>, doneText: string) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) setDone(doneText);
      else setError(result.error);
    });
  }

  return (
    <li className="flex flex-wrap items-start gap-3 px-4 py-3">
      <Link href={`/u/${request.person.username}`}>
        <Avatar username={request.person.username} name={request.person.display_name} src={request.person.avatar_url} size={40} />
      </Link>
      <div className="min-w-0 flex-1 text-sm">
        <p>
          <Link href={`/u/${request.person.username}`} className="font-semibold hover:underline">
            {request.person.display_name || `@${request.person.username}`}
          </Link>{" "}
          <span className="tag ml-1">{labelFor(CONNECT_REASONS, request.reason)}</span>
        </p>
        {request.note && <p className="mt-1 break-words text-ink/90">“{request.note}”</p>}
        <p className="mt-1 text-xs text-muted" suppressHydrationWarning>
          {timeAgo(request.created_at)}
        </p>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      <div className="flex gap-2">
        {done ? (
          <span className="text-sm text-muted">{done}</span>
        ) : incoming ? (
          <>
            <button type="button" className="btn-accent px-3 py-1.5" disabled={pending} onClick={() => run(() => respondConnection(request.id, true), "Connected")}>
              Accept
            </button>
            <button type="button" className="btn-ghost px-3 py-1.5" disabled={pending} onClick={() => run(() => respondConnection(request.id, false), "Declined")}>
              Decline
            </button>
          </>
        ) : (
          <button type="button" className="btn-ghost px-3 py-1.5" disabled={pending} onClick={() => run(() => removeConnection(request.id), "Withdrawn")}>
            Withdraw
          </button>
        )}
      </div>
    </li>
  );
}

// A conversation: messages, a composer, and a quiet refresh every few seconds
// so replies show up without reloading.
export function Thread({
  personId,
  username,
  messages,
  canMessage,
}: {
  personId: string;
  username: string;
  messages: Message[];
  canMessage: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const unread = messages.some((m) => !m.mine && !m.read_at);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (unread) void markThreadRead(personId);
  }, [unread, personId]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 8000);
    return () => clearInterval(id);
  }, [router]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await sendMessage(personId, username, body);
      if (result.ok) setBody("");
      else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2" aria-label="Messages">
        {messages.length === 0 && <li className="text-center text-sm text-muted">No messages yet. Say hi!</li>}
        {messages.map((m) => (
          <li key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] break-words whitespace-pre-line ${
                m.mine ? "rounded-br-sm bg-accent text-accent-ink" : "rounded-bl-sm border border-line bg-surface"
              }`}
            >
              {m.body}
              <span className={`mt-0.5 block text-right text-[10px] ${m.mine ? "text-accent-ink/70" : "text-muted"}`} suppressHydrationWarning>
                {timeAgo(m.created_at)}
              </span>
            </div>
          </li>
        ))}
      </ol>
      <div ref={endRef} />
      {canMessage ? (
        <form onSubmit={send} className="sticky bottom-[calc(var(--tabbar)+0.5rem)] flex gap-2 rounded-xl border border-line bg-surface p-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Message"
            aria-label="Write a message"
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none"
          />
          <button className="btn-accent px-4" disabled={pending || !body.trim()}>
            Send
          </button>
        </form>
      ) : (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          You can message each other once you&apos;re connected.{" "}
          <Link href={`/u/${username}`} className="text-accent hover:underline">
            Go to their profile
          </Link>
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
