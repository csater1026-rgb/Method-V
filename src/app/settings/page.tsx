import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getOwnProfile } from "@/lib/data";
import { isSupabaseConfigured, publicFileUrl } from "@/lib/supabase/env";

import { AvatarForm } from "./AvatarForm";
import { PasswordForm } from "./PasswordForm";
import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Edit profile" };

export default async function SettingsPage() {
  if (!isSupabaseConfigured) redirect("/login");
  const profile = await getOwnProfile();
  if (!profile) redirect("/login?next=/settings");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="display rise text-6xl">Edit profile</h1>
      <p className="mt-1 text-muted">Your photo, name, bio and status: how people know who you are and whether to message you.</p>
      <AvatarForm
        userId={profile.id}
        username={profile.username}
        name={profile.display_name}
        current={publicFileUrl(profile.avatar_path ?? null)}
      />
      <ProfileForm profile={profile} />
      <PasswordForm />
    </div>
  );
}
