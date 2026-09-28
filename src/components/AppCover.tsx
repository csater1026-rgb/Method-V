"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { setAppCover } from "@/app/actions";
import { COVER_HEIGHT, COVER_WIDTH } from "@/lib/cover-size";
import { cropToJpeg, imageProblem } from "@/lib/crop-image";
import { DROPS_BUCKET } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

export { COVER_HEIGHT, COVER_WIDTH };

// Crops and uploads a picked cover into the builder's own folder; returns its
// storage path, or an error.
export async function uploadAppCover(userId: string, file: File): Promise<{ path: string } | { error: string }> {
  const problem = imageProblem(file);
  if (problem) return { error: problem };
  let picture: Blob;
  try {
    picture = await cropToJpeg(file, COVER_WIDTH, COVER_HEIGHT);
  } catch {
    return { error: "Couldn't read that image. Try a JPG or PNG." };
  }
  const path = `${userId}/appcover-${Date.now()}.jpg`;
  const up = await createClient().storage.from(DROPS_BUCKET).upload(path, picture, { contentType: "image/jpeg", upsert: false });
  return up.error ? { error: "Upload failed. Check your connection and try again." } : { path };
}

// On your own app's page: the picture your app shows on Browse, Featured and
// every card. Without one, cards use the frame from your latest Drop.
export function AppCoverEditor({ appId, userId, current, dropFrame }: { appId: string; userId: string; current: string | null; dropFrame: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const up = await uploadAppCover(userId, file);
      if ("error" in up) return setError(up.error);
      const saved = await setAppCover(appId, up.path);
      if (!saved.ok) {
        await createClient().storage.from(DROPS_BUCKET).remove([up.path]);
        return setError(saved.error);
      }
      setPreview(createClient().storage.from(DROPS_BUCKET).getPublicUrl(up.path).data.publicUrl);
      router.refresh();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const saved = await setAppCover(appId, null);
    setBusy(false);
    if (!saved.ok) return setError(saved.error);
    setPreview(null);
    router.refresh();
  }

  const shown = preview ?? dropFrame;
  return (
    <section aria-label="Card image" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="display text-3xl">Card image</h2>
      <p className="mt-1 text-sm text-muted">
        What people see on Browse, Featured and every card.{" "}
        {preview ? "This is your cover image." : "Right now it's the frame from your Drop. Add a cover to pick your own."}
      </p>
      <div className="mt-3 aspect-video w-full max-w-md overflow-hidden rounded-lg border border-line bg-surface-2">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="Your app's card image" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">No image yet</div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-accent" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Saving…" : preview ? "Change cover image" : "Add a cover image"}
        </button>
        {preview && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => void remove()}>
            Use my Drop&apos;s frame
          </button>
        )}
        <p className="text-xs text-muted">Wide works best (16:9), like a screenshot of your app.</p>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Cover image"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </section>
  );
}
