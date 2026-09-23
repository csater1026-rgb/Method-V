"use client";

import { useEffect, useRef, useState } from "react";

import { checkAppLink, createApp } from "@/app/actions";
import { CATEGORIES, DROP_VIDEO_TYPES, MAX_DROP_BYTES, MAX_DROP_SECONDS, PRICING, STAGES } from "@/lib/constants";
import { formatDuration } from "@/lib/format";
import { DEMO_MODE_MESSAGE, DROPS_BUCKET } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

// Recorders often land a hair over a round number, so allow half a second.
const DURATION_GRACE = 0.5;

type Video = { file: File; url: string; duration: number; poster: Blob | null };
type LinkState = { state: "unchecked" | "checking" | "ok" | "bad"; message?: string };
type Step = "idle" | "uploading" | "saving";

export function SubmitForm({ userId }: { userId: string | null }) {
  const [video, setVideo] = useState<Video | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [link, setLink] = useState<LinkState>({ state: "unchecked" });
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (video) URL.revokeObjectURL(video.url);
  }, [video]);

  async function onPickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setVideo(null);
    setVideoError(null);
    if (!file) return;
    if (!DROP_VIDEO_TYPES.includes(file.type)) {
      setVideoError("Use an MP4, WebM or MOV video.");
      return;
    }
    if (file.size > MAX_DROP_BYTES) {
      setVideoError("Videos can be up to 100 MB. Try exporting at 1080p or lower.");
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const { duration, poster } = await inspectVideo(url);
      if (duration > MAX_DROP_SECONDS + DURATION_GRACE) {
        URL.revokeObjectURL(url);
        setVideoError(`That video is ${Math.round(duration)} seconds. Drops can be up to ${MAX_DROP_SECONDS} seconds — trim it and try again.`);
        return;
      }
      setVideo({ file, url, duration: Math.min(duration, MAX_DROP_SECONDS), poster });
    } catch {
      URL.revokeObjectURL(url);
      setVideoError("We couldn't read that video. Try exporting it again as MP4.");
    }
  }

  async function onCheckLink() {
    const value = urlRef.current?.value ?? "";
    if (!value) return;
    if (!userId) {
      setLink({ state: "bad", message: DEMO_MODE_MESSAGE });
      return;
    }
    setLink({ state: "checking" });
    const result = await checkAppLink(value);
    setLink(result.ok ? { state: "ok", message: "Link works." } : { state: "bad", message: result.error });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!userId) {
      setError(DEMO_MODE_MESSAGE);
      return;
    }
    if (!video) {
      setError("Add your Drop video (up to 60 seconds).");
      return;
    }
    const form = new FormData(e.currentTarget);
    const get = (k: string) => String(form.get(k) ?? "");

    const supabase = createClient();
    const bucket = supabase.storage.from(DROPS_BUCKET);
    const id = crypto.randomUUID();
    const ext = video.file.type === "video/webm" ? "webm" : video.file.type === "video/quicktime" ? "mov" : "mp4";
    const videoPath = `${userId}/${id}.${ext}`;
    const posterPath = video.poster ? `${userId}/${id}.jpg` : null;

    setStep("uploading");
    const uploaded: string[] = [];
    const up = await bucket.upload(videoPath, video.file, { contentType: video.file.type, upsert: false });
    if (up.error) {
      setStep("idle");
      setError(`Upload failed: ${up.error.message}`);
      return;
    }
    uploaded.push(videoPath);
    if (posterPath && video.poster) {
      const pup = await bucket.upload(posterPath, video.poster, { contentType: "image/jpeg", upsert: false });
      if (!pup.error) uploaded.push(posterPath);
    }

    setStep("saving");
    // On success this redirects to the new app page.
    const result = await createApp({
      name: get("name"),
      tagline: get("tagline"),
      description: get("description"),
      url: get("url"),
      category: get("category"),
      techStack: get("tech_stack"),
      pricing: get("pricing"),
      stage: get("stage"),
      caption: get("caption"),
      videoPath,
      posterPath: uploaded.includes(posterPath ?? "") ? posterPath : null,
      durationSeconds: video.duration,
    });
    if (result && !result.ok) {
      await bucket.remove(uploaded);
      setStep("idle");
      setError(result.error);
    }
  }

  const busy = step !== "idle";

  return (
    <form onSubmit={onSubmit} className="mt-6 grid gap-6 md:grid-cols-[240px_1fr]">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Your Drop</span>
        <label className="relative flex aspect-[9/16] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-line bg-surface text-center text-sm text-muted hover:border-accent">
          {video ? (
            <video src={video.url} className="absolute inset-0 h-full w-full object-cover" muted playsInline autoPlay loop />
          ) : (
            <>
              <span className="text-3xl">▶</span>
              <span className="px-4">Choose a video up to 60 seconds</span>
              <span className="text-xs">MP4, WebM or MOV · 100 MB max</span>
            </>
          )}
          <input
            type="file"
            accept={DROP_VIDEO_TYPES.join(",")}
            onChange={onPickVideo}
            disabled={busy}
            className="sr-only"
            aria-label="Drop video"
          />
        </label>
        {video && (
          <p className="text-xs text-muted">
            {formatDuration(video.duration)} · {(video.file.size / 1024 / 1024).toFixed(1)} MB · tap to replace
          </p>
        )}
        {videoError && <p className="text-sm text-danger">{videoError}</p>}
      </div>

      <div className="flex flex-col gap-4">
        <Field label="App name">
          <input name="name" required maxLength={60} className="field" placeholder="NoteFlow" />
        </Field>
        <Field label="Tagline" hint="One line: what it does">
          <input name="tagline" required maxLength={120} className="field" placeholder="Meeting notes that turn into to-dos" />
        </Field>
        <Field label="Link to your live app" hint="We check it loads before it goes live">
          <div className="flex gap-2">
            <input
              ref={urlRef}
              name="url"
              type="url"
              required
              maxLength={500}
              placeholder="https://"
              className="field"
              onChange={() => setLink({ state: "unchecked" })}
            />
            <button type="button" onClick={onCheckLink} className="btn-ghost shrink-0" disabled={link.state === "checking"}>
              {link.state === "checking" ? "Checking…" : "Check link"}
            </button>
          </div>
          {link.message && (
            <span className={`text-xs ${link.state === "ok" ? "text-accent" : "text-danger"}`}>{link.message}</span>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Category">
            <select name="category" required defaultValue="" className="field">
              <option value="" disabled>
                Pick one
              </option>
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pricing">
            <select name="pricing" defaultValue="free" className="field">
              {PRICING.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Stage">
            <select name="stage" defaultValue="launched" className="field">
              {STAGES.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Built with" hint="Comma separated">
          <input name="tech_stack" className="field" placeholder="Next.js, Supabase, Lovable" />
        </Field>
        <Field label="Caption" hint="Shown on the Drop">
          <input name="caption" maxLength={300} className="field" placeholder="Recorded a real standup and let it do the rest 👀" />
        </Field>
        <Field label="Description" hint="Optional">
          <textarea name="description" maxLength={2000} rows={4} className="field" />
        </Field>

        {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm">{error}</p>}

        <button className="btn-accent self-start px-6 py-3 text-base" disabled={busy}>
          {step === "uploading" ? "Uploading video…" : step === "saving" ? "Checking link and posting…" : "Post Drop"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">
        {label} {hint && <span className="font-normal text-muted">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}

// Reads the real duration and grabs a frame to use as the thumbnail.
function inspectVideo(url: string): Promise<{ duration: number; poster: Blob | null }> {
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
      const scale = Math.min(1, 720 / (el.videoWidth || 720));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round((el.videoWidth || 720) * scale);
      canvas.height = Math.round((el.videoHeight || 1280) * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ duration, poster: null });
        return;
      }
      ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve({ duration, poster: blob }), "image/jpeg", 0.8);
    };
  });
}
