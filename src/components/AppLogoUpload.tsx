"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { setAppLogo } from "@/app/actions";
import { LOGO_SIZE } from "@/lib/app-logo";
import { cropToJpeg, imageProblem } from "@/lib/crop-image";
import { DROPS_BUCKET } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

import { AppLogo } from "./AppLogo";

// Crops a picked logo to a square (on white, for logos with see-through
// parts) and uploads it into the builder's own folder; returns its storage
// path, or an error.
export async function uploadAppLogo(userId: string, file: File): Promise<{ path: string } | { error: string }> {
  const problem = imageProblem(file);
  if (problem) return { error: problem };
  let picture: Blob;
  try {
    picture = await cropToJpeg(file, LOGO_SIZE, LOGO_SIZE, 0.9, "#ffffff");
  } catch {
    return { error: "Couldn't read that image. Try a JPG or PNG." };
  }
  const path = `${userId}/applogo-${Date.now()}.jpg`;
  const up = await createClient().storage.from(DROPS_BUCKET).upload(path, picture, { contentType: "image/jpeg", upsert: false });
  return up.error ? { error: "Upload failed. Check your connection and try again." } : { path };
}

// On your app's Manage page: its logo, next to its name on every card.
// Without one, cards show its first letter on its own colors.
export function AppLogoEditor({ appId, appName, userId, current }: { appId: string; appName: string; userId: string; current: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const up = await uploadAppLogo(userId, file);
      if ("error" in up) return setError(up.error);
      const saved = await setAppLogo(appId, up.path);
      if (!saved.ok) {
        await createClient().storage.from(DROPS_BUCKET).remove([up.path]);
        return setError(saved.error);
      }
      setLogo(createClient().storage.from(DROPS_BUCKET).getPublicUrl(up.path).data.publicUrl);
      router.refresh();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const saved = await setAppLogo(appId, null);
    setBusy(false);
    if (!saved.ok) return setError(saved.error);
    setLogo(null);
    router.refresh();
  }

  return (
    <section aria-label="Logo" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="display text-3xl">Logo</h2>
      <p className="mt-1 text-sm text-muted">
        Shows next to your app&apos;s name on Home and Browse. {logo ? "This is your logo." : "Right now it's your app's first letter."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <AppLogo name={appName} src={logo} size={72} className="border border-line" />
        <button type="button" className="btn-accent" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Saving…" : logo ? "Change logo" : "Add a logo"}
        </button>
        {logo && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => void remove()}>
            Remove
          </button>
        )}
        <p className="text-xs text-muted">Square works best, like an app icon.</p>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Logo image"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </section>
  );
}
