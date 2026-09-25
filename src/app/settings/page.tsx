import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getNotificationSettings, getOwnProfile, getViewer } from "@/lib/data";
import { SignOutButton } from "@/components/SignOutButton";
import { isSupabaseConfigured, publicFileUrl } from "@/lib/supabase/env";

import { AvatarForm } from "./AvatarForm";
import { NotificationsForm } from "./NotificationsForm";
import { PasswordForm } from "./PasswordForm";
import { ProfileForm } from "./ProfileForm";
import { Handle } from "@/components/Handle";

export const metadata: Metadata = { title: "Edit profile" };

export default async function SettingsPage() {
  if (!isSupabaseConfigured) redirect("/login");
  const profile = await getOwnProfile();
  if (!profile) redirect("/login?next=/settings");
  const notifications = await getNotificationSettings(await getViewer());

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
      <NotificationsForm
        initial={{ follows: notifications.follows, feedback: notifications.feedback, messages: notifications.messages }}
        ready={notifications.ready}
        vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
      />
      <PasswordForm />
      <section aria-label="Sign out" className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        <p className="text-sm text-muted">
          Signed in as <Handle username={profile.username} />.{" "}
          <Link href="/?tour=1" className="text-accent hover:underline">
            Take the tour again
          </Link>
        </p>
        <SignOutButton />
      </section>
    </div>
  );
}
