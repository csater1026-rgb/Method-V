import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getOwnProfile, getViewer } from "@/lib/data";
import { safeNextPath } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, publicFileUrl } from "@/lib/supabase/env";
import { isDefaultUsername, suggestUsername } from "@/lib/username";

import { AvatarForm } from "../settings/AvatarForm";
import { WelcomeForm } from "./WelcomeForm";

export const metadata: Metadata = { title: "Set up your profile" };

// Right after someone's first sign-in (and the Terms), before the tour: a
// real username instead of builder_1a2b3c…, their name, and a photo if they
// like. Home sends people here until they save or skip.
export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const params = await searchParams;
  const raw = safeNextPath(typeof params.next === "string" ? params.next : null);
  const next = raw.startsWith("/welcome") ? "/" : raw;

  let userId = "demo";
  let username = "builder_0000000000";
  let name = "";
  let photo: string | null = null;
  let suggestion = "maya_builds";
  if (isSupabaseConfigured) {
    const viewer = await getViewer();
    if (!viewer) redirect("/login?next=/welcome");
    if (!isDefaultUsername(viewer.username)) redirect(next);
    const [profile, claims] = await Promise.all([getOwnProfile(), (await createClient()).auth.getClaims()]);
    const email = claims.data?.claims?.email;
    userId = viewer.id;
    username = viewer.username;
    name = profile?.display_name ?? "";
    photo = publicFileUrl(profile?.avatar_path ?? null);
    suggestion = suggestUsername(name, typeof email === "string" ? email : null);
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      <p className="eyebrow">Welcome to Method V</p>
      <h1 className="display rise mt-1 text-6xl">Set up your profile</h1>
      <p className="mt-2 text-muted">
        Pick the name people will see on your apps, feedback and questions. You can change any of it later in Edit profile.
      </p>
      <AvatarForm userId={userId} username={username} name={name} current={photo} />
      <WelcomeForm suggestion={suggestion} name={name} next={next} />
    </div>
  );
}
