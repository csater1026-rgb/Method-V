// In the browser: reading a picked Drop video (its real length and a frame
// for the thumbnail) and uploading it into the builder's own folder. Used by
// the Post screen and by "Add a Drop" on an app's Manage page.

import { DROP_VIDEO_TYPES, MAX_DROP_BYTES, MAX_DROP_MB, MAX_DROP_SECONDS } from "./constants";
import { DROPS_BUCKET } from "./supabase/env";
import { createClient } from "./supabase/client";

// Recorders often land a hair over a round number, so allow half a second.
const DURATION_GRACE = 0.5;

// `landscape`: wider than tall (a 16:9 screen recording). Both shapes work;
// the previews use it to show the video whole.
export type DropVideo = { file: File; url: string; duration: number; poster: Blob | null; landscape: boolean };

// Checks a picked file and reads it. The caller revokes `url` when done.
export async function readDropVideo(file: File): Promise<{ ok: true; video: DropVideo } | { ok: false; error: string }> {
  if (!DROP_VIDEO_TYPES.includes(file.type)) return { ok: false, error: "Use an MP4, WebM or MOV video." };
  if (file.size > MAX_DROP_BYTES) {
    return { ok: false, error: `Videos can be up to ${MAX_DROP_MB} MB. Trim it, or record at 1080p instead of 4K.` };
  }
  const url = URL.createObjectURL(file);
  try {
    const { duration, poster, landscape } = await inspectVideo(url);
    if (duration > MAX_DROP_SECONDS + DURATION_GRACE) {
      URL.revokeObjectURL(url);
      return {
        ok: false,
        error: `That video is ${Math.round(duration)} seconds. Drops can be up to ${MAX_DROP_SECONDS} seconds — trim it and try again.`,
      };
    }
    return { ok: true, video: { file, url, duration: Math.min(duration, MAX_DROP_SECONDS), poster, landscape } };
  } catch {
    URL.revokeObjectURL(url);
    return { ok: false, error: "We couldn't read that video. Try exporting it again as MP4." };
  }
}

// Uploads the video (and its thumbnail, if there is one) into
// drops/<user id>/. Returns the paths, or a friendly error.
export async function uploadDropVideo(
  userId: string,
  video: DropVideo,
): Promise<{ ok: true; videoPath: string; posterPath: string | null } | { ok: false; error: string }> {
  const bucket = createClient().storage.from(DROPS_BUCKET);
  const id = crypto.randomUUID();
  const ext = video.file.type === "video/webm" ? "webm" : video.file.type === "video/quicktime" ? "mov" : "mp4";
  const videoPath = `${userId}/${id}.${ext}`;
  const up = await bucket.upload(videoPath, video.file, { contentType: video.file.type, upsert: false });
  if (up.error) {
    return {
      ok: false,
      error: /size|too large|exceed/i.test(up.error.message)
        ? `That video is too big to upload (the limit is ${MAX_DROP_MB} MB). Trim it, or record at 1080p instead of 4K.`
        : `Upload failed: ${up.error.message}`,
    };
  }
  let posterPath: string | null = null;
  if (video.poster) {
    const path = `${userId}/${id}.jpg`;
    const pup = await bucket.upload(path, video.poster, { contentType: "image/jpeg", upsert: false });
    if (!pup.error) posterPath = path;
  }
  return { ok: true, videoPath, posterPath };
}

// Reads the real duration and shape, and grabs a frame to use as the thumbnail.
export function inspectVideo(url: string): Promise<{ duration: number; poster: Blob | null; landscape: boolean }> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.muted = true;
    el.playsInline = true;
    el.src = url;
    let duration = 0;

    const fail = () => reject(new Error("unreadable"));
    const timer = setTimeout(fail, 15000);

    el.onerror = () => {
      clearTimeout(timer);
      fail();
    };
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration)) {
        duration = el.duration;
        el.currentTime = Math.min(1, duration / 2);
      } else {
        // Some recorders write WebM without a duration; seeking far ahead makes the browser work it out.
        el.currentTime = 1e9;
      }
    };
    el.onseeked = () => {
      if (!duration) {
        if (!Number.isFinite(el.duration)) return;
        duration = el.duration;
        el.currentTime = Math.min(1, duration / 2);
        return;
      }
      clearTimeout(timer);
      const landscape = el.videoWidth > el.videoHeight;
      const scale = Math.min(1, 720 / (el.videoWidth || 720));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round((el.videoWidth || 720) * scale);
      canvas.height = Math.round((el.videoHeight || 1280) * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ duration, poster: null, landscape });
        return;
      }
      ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve({ duration, poster: blob, landscape }), "image/jpeg", 0.8);
    };
  });
}
