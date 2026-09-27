"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { setCover } from "@/app/actions";
import { DROPS_BUCKET } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";
import { cropToJpeg, imageProblem } from "@/lib/crop-image";

const WIDTH = 1500;
const HEIGHT = 500;

export function CoverForm({ userId, current }: { userId: string; current: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    const problem = imageProblem(file);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      let picture: Blob;
      try {
        picture = await cropToJpeg(file, WIDTH, HEIGHT);
      } catch {
        setError("Couldn't read that image. Try a JPG or PNG.");
        return;
      }
      const path = `${userId}/cover-${Date.now()}.jpg`;
      const bucket = createClient().storage.from(DROPS_BUCKET);
      const up = await bucket.upload(path, picture, { contentType: "image/jpeg", upsert: false });
      if (up.error) {
        setError("Upload failed. Check your connection and try again.");
        return;
      }
      const saved = await setCover(path);
      if (!saved.ok) {
        await bucket.remove([path]);
        setError(saved.error);
        return;
      }
      setPreview(bucket.getPublicUrl(path).data.publicUrl);
      router.refresh();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const saved = await setCover(null);
    setBusy(false);
    if (!saved.ok) return setError(saved.error);
    setPreview(null);
    router.refresh();
  }

  return (
    <section id="cover" aria-label="Header picture" className="mt-6 scroll-mt-20">
      <div className="aspect-[3/1] w-full overflow-hidden rounded-xl border border-line bg-surface-2">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Your header picture" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">No header picture yet</div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Saving…" : preview ? "Change header picture" : "Add a header picture"}
        </button>
        {preview && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => void remove()}>
            Remove
          </button>
        )}
        <p className="text-xs text-muted">A wide picture (3:1) behind your photo, only on your profile page.</p>
      </div>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Header picture"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </section>
  );
}
