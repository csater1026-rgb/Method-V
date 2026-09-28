import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "./supabase/server";

// Removing a question or an answer from an app's Q&A: the person who posted
// it, or the app's builder (keeping their own Q&A clean). Removing a question
// removes its answers too. Shared by the website and the phone app
// (/api/mobile/remove-post). `supabase` acts as the person; the builder's
// removal of someone else's post is done with the secret key, after checking
// here that they own the app.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RemoveResult = { ok: true; appSlug: string; questionId: string } | { ok: false; error: string };

export async function removePost(supabase: SupabaseClient, viewerId: string, kind: "question" | "answer", id: string): Promise<RemoveResult> {
  if ((kind !== "question" && kind !== "answer") || !UUID.test(id)) return { ok: false, error: "Unknown post." };

  let questionId = id;
  let authorId: string | null = null;
  if (kind === "answer") {
    const { data: answer } = await supabase.from("answers").select("id, user_id, question_id").eq("id", id).maybeSingle();
    if (!answer) return { ok: false, error: "That answer is already gone." };
    questionId = answer.question_id as string;
    authorId = answer.user_id as string;
  }
  const { data: question } = await supabase
    .from("questions")
    .select("id, user_id, app:apps!inner(slug, owner_id)")
    .eq("id", questionId)
    .maybeSingle();
  if (!question) return { ok: false, error: "That question is already gone." };
  const app = question.app as unknown as { slug: string; owner_id: string };
  if (kind === "question") authorId = question.user_id as string;

  const isAuthor = authorId === viewerId;
  const isBuilder = app.owner_id === viewerId;
  if (!isAuthor && !isBuilder) return { ok: false, error: "Only the person who posted it or the app's builder can remove it." };

  const client = isAuthor ? supabase : createAdminClient();
  if (!client) return { ok: false, error: "Removing other people's posts isn't switched on yet (the server is missing its secret key)." };
  const { error } = await client
    .from(kind === "question" ? "questions" : "answers")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: "Couldn't remove it. Try again." };
  return { ok: true, appSlug: app.slug, questionId };
}
