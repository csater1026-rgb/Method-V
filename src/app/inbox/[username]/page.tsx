import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Avatar } from "@/components/Avatar";
import { Thread } from "@/components/Inbox";
import { getThread, getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function generateMetadata({ params }: PageProps<"/inbox/[username]">): Promise<Metadata> {
  return { title: `Messages with @${(await params).username}` };
}

export default async function ThreadPage({ params }: PageProps<"/inbox/[username]">) {
  const { username } = await params;
  const viewer = await getViewer();
  if (!isSupabaseConfigured) redirect("/inbox");
  if (!viewer) redirect(`/login?next=/inbox/${encodeURIComponent(username)}`);

  const thread = await getThread(viewer, username.toLowerCase());
  if (!thread) notFound();
  const { person, messages, connection } = thread;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <header className="mb-4 flex items-center gap-3 border-b border-line pb-3">
        <Link href="/inbox?tab=messages" aria-label="Back to messages" className="btn-ghost px-3">
          ←
        </Link>
        <Link href={`/u/${person.username}`} className="flex items-center gap-2">
          <Avatar username={person.username} name={person.display_name} size={36} />
          <span>
            <span className="block font-semibold">{person.display_name || `@${person.username}`}</span>
            <span className="block text-xs text-muted">@{person.username}</span>
          </span>
        </Link>
      </header>
      <Thread
        personId={person.id}
        username={person.username}
        messages={messages}
        canMessage={connection.status === "connected"}
      />
    </div>
  );
}
