import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppCoverEditor } from "@/components/AppCover";
import { AppLogoEditor } from "@/components/AppLogoUpload";
import { DropBonusBanner } from "@/components/DropBonus";
import { getManageApp, getPromotion, getViewer } from "@/lib/data";
import { isSupabaseConfigured, publicFileUrl } from "@/lib/supabase/env";

import { AppDetailsForm, AppLinkForm, DeleteAppForm, ManageDrops } from "./ManageApp";

export const metadata: Metadata = { title: "Manage your app" };

// Everything about one of your apps in one place: its Drops, details, link,
// logo, card picture and feedback, and deleting it. Only the builder can open it.
export default async function ManageAppPage({ params }: PageProps<"/apps/[slug]/manage">) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (isSupabaseConfigured && !viewer) redirect(`/login?next=${encodeURIComponent(`/apps/${slug}/manage`)}`);
  const data = await getManageApp(slug, viewer);
  if (!data) {
    // Someone else's app: just show it.
    if (isSupabaseConfigured) redirect(`/apps/${slug}`);
    notFound();
  }
  const { app, drops, unreplied } = data;
  const userId = viewer?.id ?? "demo";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="eyebrow">Manage</p>
      <h1 className="display rise mt-1 text-6xl break-words">{app.name}</h1>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/apps/${app.slug}`} className="btn-ghost">
          View app page
        </Link>
        <Link href={`/apps/${app.slug}#feedback`} className="btn-ghost">
          Feedback{app.feedback_count > 0 ? ` · ${app.feedback_count}` : ""}
        </Link>
        <Link href={`/dashboard?app=${app.slug}`} className="btn-ghost">
          Stats
        </Link>
      </div>
      {!isSupabaseConfigured && (
        <p className="mt-4 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted">
          This is demo mode, so changes aren&apos;t saved. Connect Supabase to manage real apps.
        </p>
      )}

      {unreplied !== null && unreplied > 0 && (
        <Link
          href={`/apps/${app.slug}#feedback`}
          className="mt-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/60 bg-surface px-4 py-3 text-sm transition hover:border-accent"
        >
          <span>
            <strong>
              {unreplied} {unreplied === 1 ? "piece" : "pieces"} of feedback
            </strong>{" "}
            <span className="text-muted">waiting for your reply. Testers see what you say.</span>
          </span>
          <span className="font-semibold text-accent">Reply →</span>
        </Link>
      )}

      <DropBonusBanner promo={await getPromotion("drop_bonus")} className="mt-6" />
      <ManageDrops appId={app.id} appSlug={app.slug} appName={app.name} userId={userId} drops={drops} />
      <AppDetailsForm app={app} />
      <AppLinkForm appId={app.id} url={app.url} />

      <div className="mt-10 flex flex-col gap-6">
        <AppLogoEditor appId={app.id} appName={app.name} userId={userId} current={publicFileUrl(app.logo_path ?? null)} />
        <AppCoverEditor appId={app.id} userId={userId} current={publicFileUrl(app.cover_path ?? null)} dropFrame={drops[0]?.poster_url ?? null} />
      </div>

      <section aria-labelledby="manage-grow" className="mt-10 rounded-xl border border-line bg-surface p-4">
        <h2 id="manage-grow" className="font-semibold">
          Launch day, Spotlight, share kit and sponsorships
        </h2>
        <p className="mt-1 text-sm text-muted">These live under Grow on your app&apos;s page, where you can see how they look.</p>
        <Link href={`/apps/${app.slug}#grow`} className="mt-2 inline-block text-sm text-accent hover:underline">
          Open Grow →
        </Link>
      </section>

      <DeleteAppForm appId={app.id} appName={app.name} username={viewer?.username ?? ""} />
    </div>
  );
}
