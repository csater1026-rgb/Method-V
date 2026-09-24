import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppTile } from "@/components/AppTile";
import { QuestionItem } from "@/components/QandA";
import { getQuestion, getViewer } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/q/[id]">): Promise<Metadata> {
  const { id } = await params;
  const question = await getQuestion(id, null);
  return question ? { title: question.body.slice(0, 70), description: `A question about ${question.app.name} on Method V` } : { title: "Question not found" };
}

// One question's whole thread: the question (and its poll), answers with
// votes and replies, and the best answer on top.
export default async function QuestionPage({ params }: PageProps<"/q/[id]">) {
  const { id } = await params;
  const viewer = await getViewer();
  const question = await getQuestion(id, viewer);
  if (!question) notFound();
  const { app } = question;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <Link href="/drops?tab=questions" className="text-sm text-muted hover:text-ink">
        ← Questions
      </Link>
      <Link href={`/apps/${app.slug}`} className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-surface p-3 hover:border-accent">
        <AppTile name={app.name} category={app.category} poster={app.poster_url} size={48} />
        <span className="min-w-0 flex-1">
          <span className="display block truncate text-2xl">{app.name}</span>
          <span className="block truncate text-xs text-muted">{app.tagline}</span>
        </span>
        {question.by_builder && <span className="tag-accent shrink-0">Builder asks</span>}
      </Link>
      <ul className="mt-4">
        <QuestionItem
          question={question}
          app={{ id: app.id, slug: app.slug, name: app.name, owner_id: app.owner_id }}
          viewerId={viewer?.id ?? null}
          onThreadPage
        />
      </ul>
      {!viewer && (
        <p className="mt-3 text-sm text-muted">
          <Link href={`/login?next=${encodeURIComponent(`/q/${question.id}`)}`} className="text-accent hover:underline">
            Sign in
          </Link>{" "}
          to answer, reply or vote.
        </p>
      )}
    </div>
  );
}
