"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { setAvatar } from "@/app/actions";
import { Avatar } from "@/components/Avatar";
import { DROPS_BUCKET } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

const SIZE = 320;
const MAX_BYTES = 15 * 1024 * 1024;

// The photo is cropped to a centered square and shrunk to 320px in the
// browser, so only a small JPEG is uploaded, into the person's own folder.
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new Error("no blob");
  return blob;
}

export function AvatarForm({
  userId,
  username,
  name,
  current,
}: {
  userId: string;
  username: string;
  name: string;
  current: string | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) return setError("Pick an image file (JPG, PNG, HEIC or WebP).");
    if (file.size > MAX_BYTES) return setError("That image is over 15 MB. Pick a smaller one.");
    setBusy(true);
    try {
      let photo: Blob;
      try {
        photo = await squareJpeg(file);
      } catch {
        setError("Couldn't read that image. Try a JPG or PNG.");
        return;
      }
      const path = `${userId}/avatar-${Date.now()}.jpg`;
      const bucket = createClient().storage.from(DROPS_BUCKET);
      const up = await bucket.upload(path, photo, { contentType: "image/jpeg", upsert: false });
      if (up.error) {
        setError("Upload failed. Check your connection and try again.");
        return;
      }
      const saved = await setAvatar(path);
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
    const saved = await setAvatar(null);
    setBusy(false);
    if (!saved.ok) return setError(saved.error);
    setPreview(null);
    router.refresh();
  }

  return (
    <section aria-label="Profile photo" className="mt-6 flex items-center gap-4">
      <Avatar username={username} name={name} src={preview} size={80} />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-accent" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Saving…" : preview ? "Change photo" : "Add a photo"}
          </button>
          {preview && (
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => void remove()}>
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-muted">Square works best. It shows next to your name everywhere.</p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Profile photo"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </section>
  );
}
