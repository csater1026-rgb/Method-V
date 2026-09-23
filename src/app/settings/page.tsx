import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getOwnProfile } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";

import { ProfileForm } from "./ProfileForm";

export const metadata: Metadata = { title: "Edit profile" };

export default async function SettingsPage() {
  if (!isSupabaseConfigured) redirect("/login");
  const profile = await getOwnProfile();
  if (!profile) redirect("/login?next=/settings");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="display rise text-6xl">Edit profile</h1>
      <p className="mt-1 text-muted">Tell people what you build and what you&apos;re looking for.</p>
      <ProfileForm profile={profile} />
    </div>
  );
}
