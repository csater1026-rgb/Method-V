import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Avatar } from "@/components/Avatar";
import { ActivityList, RequestRow } from "@/components/Inbox";
import {
  getConnectionRequests,
  getConversations,
  getInboxCounts,
  getNotifications,
  getViewer,
} from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { Handle } from "@/components/Handle";

export const metadata: Metadata = { title: "Inbox" };

const TABS = [
  { slug: "activity", label: "Activity" },
  { slug: "messages", label: "Messages" },
  { slug: "requests", label: "Requests" },
] as const;

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const viewer = await getViewer();
  if (isSupabaseConfigured && !viewer) redirect("/login?next=/inbox");
  const { tab: tabParam } = await searchParams;
  const tab = TABS.some((t) => t.slug === tabParam) ? (tabParam as (typeof TABS)[number]["slug"]) : "activity";

  if (!viewer) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="display rise text-6xl">Inbox</h1>
        <p className="mt-2 text-muted">
          Likes, follows, feedback, answers, messages and requests to connect all land here. The inbox is off in demo
          mode.
        </p>
      </div>
    );
  }

  const counts = await getInboxCounts(viewer);
  const badge = { activity: counts.notifications, messages: counts.messages, requests: counts.requests };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="display rise text-6xl">Inbox</h1>

      <nav aria-label="Inbox" className="mt-4 flex gap-5 border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.slug}
            href={t.slug === "activity" ? "/inbox" : `/inbox?tab=${t.slug}`}
            aria-current={t.slug === tab ? "page" : undefined}
            className={`display flex items-center gap-1.5 pb-2 text-2xl ${
              t.slug === tab ? "text-ink shadow-[inset_0_-3px_0_var(--color-accent)]" : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
            {badge[t.slug] > 0 && (
              <span className="rounded-full bg-heart px-1.5 font-mono text-[10px] font-bold text-white">{badge[t.slug]}</span>
            )}
          </Link>
        ))}
      </nav>

      {tab === "activity" && <ActivityList items={await getNotifications(viewer)} />}
      {tab === "messages" && <Conversations viewer={viewer} />}
      {tab === "requests" && <Requests viewer={viewer} />}
    </div>
  );
}

async function Conversations({ viewer }: { viewer: NonNullable<Awaited<ReturnType<typeof getViewer>>> }) {
  const conversations = await getConversations(viewer);
  if (conversations.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted">
        No messages yet. Connect with a builder from their profile, then message them here.
      </p>
    );
  }
  return (
    <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
      {conversations.map((c) => (
        <li key={c.person.id}>
          <Link href={`/inbox/${c.person.username}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
            <Avatar username={c.person.username} name={c.person.display_name} src={c.person.avatar_url} size={40} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className={`truncate ${c.unread ? "font-bold" : "font-semibold"}`}>
                  {c.person.display_name || <Handle username={c.person.username} />}
                </span>
                <span className="shrink-0 text-xs text-muted" suppressHydrationWarning>
                  {timeAgo(c.last.created_at)}
                </span>
              </span>
              <span className={`block truncate text-sm ${c.unread ? "text-ink" : "text-muted"}`}>
                {c.last.mine ? "You: " : ""}
                {c.last.body}
              </span>
            </span>
            {c.unread > 0 && (
              <span className="rounded-full bg-heart px-1.5 font-mono text-[10px] font-bold text-white">{c.unread}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function Requests({ viewer }: { viewer: NonNullable<Awaited<ReturnType<typeof getViewer>>> }) {
  const { received, sent } = await getConnectionRequests(viewer);
  return (
    <>
      <h2 className="display mt-6 text-3xl">Want to connect</h2>
      {received.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No requests right now.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
          {received.map((r) => (
            <RequestRow key={r.id} request={r} incoming />
          ))}
        </ul>
      )}
      <h2 className="display mt-8 text-3xl">Sent</h2>
      {sent.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing waiting on an answer.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
          {sent.map((r) => (
            <RequestRow key={r.id} request={r} incoming={false} />
          ))}
        </ul>
      )}
    </>
  );
}
