"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createApp, previewLink } from "@/app/actions";
import { LoadingCoder } from "@/components/LoadingCoder";
import {
  CATEGORIES,
  DROP_VIDEO_TYPES,
  MAX_DROP_BYTES,
  MAX_DROP_SECONDS,
  PRICING,
  STAGES,
  type Category,
} from "@/lib/constants";
import { formatDuration } from "@/lib/format";
import { clearPendingVideo, peekPendingVideo } from "@/lib/pending-video";
import { DEMO_MODE_MESSAGE, DROPS_BUCKET } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

// Recorders often land a hair over a round number, so allow half a second.
const DURATION_GRACE = 0.5;

type Video = { file: File; url: string; duration: number; poster: Blob | null };
type LinkState = { state: "empty" | "reading" | "ok" | "bad"; message?: string };
type Step = "idle" | "uploading" | "saving";

// Posting in two steps: 1) your video, 2) your link. Name, tagline and
// category fill themselves in from your site; everything else is optional.
export function SubmitForm({ userId }: { userId: string | null }) {
  const [video, setVideo] = useState<Video | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  const [url, setUrl] = useState("");
  const [link, setLink] = useState<LinkState>({ state: "empty" });
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [pricing, setPricing] = useState("free");
  const [stage, setStage] = useState("launched");
  const [techStack, setTechStack] = useState("");
  const [caption, setCaption] = useState("");
  // Once someone types in a field, auto-fill leaves it alone.
  const touched = useRef({ name: false, tagline: false, description: false, category: false });
  const lastPreviewed = useRef("");

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (video) URL.revokeObjectURL(video.url);
    },
    [video],
  );

  const pickFile = useCallback(async (file: File) => {
    setVideo(null);
    setVideoError(null);
    if (!DROP_VIDEO_TYPES.includes(file.type)) {
      setVideoError("Use an MP4, WebM or MOV video.");
      return;
    }
    if (file.size > MAX_DROP_BYTES) {
      setVideoError("Videos can be up to 100 MB. Try exporting at 1080p or lower.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    try {
      const { duration, poster } = await inspectVideo(objectUrl);
      if (duration > MAX_DROP_SECONDS + DURATION_GRACE) {
        URL.revokeObjectURL(objectUrl);
        setVideoError(
          `That video is ${Math.round(duration)} seconds. Drops can be up to ${MAX_DROP_SECONDS} seconds — trim it and try again.`,
        );
        return;
      }
      setVideo({ file, url: objectUrl, duration: Math.min(duration, MAX_DROP_SECONDS), poster });
    } catch {
      URL.revokeObjectURL(objectUrl);
      setVideoError("We couldn't read that video. Try exporting it again as MP4.");
    }
  }, []);

  // A video picked from the + button on the previous screen.
  useEffect(() => {
    const file = peekPendingVideo();
    if (!file) return;
    const t = setTimeout(() => {
      clearPendingVideo();
      void pickFile(file);
    }, 0);
    return () => clearTimeout(t);
  }, [pickFile]);

  async function readSite(value: string) {
    const trimmed = value.trim();
    if (!/^https?:\/\/[^\s/]+\.[^\s]+/i.test(trimmed) || trimmed === lastPreviewed.current) return;
    lastPreviewed.current = trimmed;
    if (!userId) {
      setLink({ state: "bad", message: DEMO_MODE_MESSAGE });
      return;
    }
    setLink({ state: "reading" });
    const result = await previewLink(trimmed);
    if (!result.ok) {
      setLink({ state: "bad", message: result.error });
      return;
    }
    const p = result.preview;
    if (!touched.current.name && p.name) setName(p.name);
    if (!touched.current.tagline && p.tagline) setTagline(p.tagline);
    if (!touched.current.description && p.description) setDescription(p.description);
    if (!touched.current.category && p.category) setCategory(p.category);
    setLink({ state: "ok", message: p.name ? "Link works. We filled in the details from your site." : "Link works." });
  }

  const missing = [
    !video && "your video",
    !url.trim() && "your link",
    !name.trim() && "a name",
    !tagline.trim() && "a tagline",
    !category && "a category",
  ].filter(Boolean) as string[];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!userId) {
      setError(DEMO_MODE_MESSAGE);
      return;
    }
    if (missing.length > 0 || !video) {
      setError(`Add ${missing.join(", ")}.`);
      return;
    }

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
      name,
      tagline,
      description,
      url,
      category,
      techStack,
      pricing,
      stage,
      caption,
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
    <>
      {busy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 backdrop-blur-sm">
          <LoadingCoder message={step === "uploading" ? "Uploading your Drop…" : "Checking your link and posting…"} />
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-8">
        {/* Step 1 */}
        <section aria-labelledby="step-video">
          <StepTitle n={1} id="step-video">
            Your Drop
          </StepTitle>
          {video ? (
            <div className="mt-3 flex items-end gap-4">
              <video
                src={video.url}
                className="aspect-[9/16] w-28 rounded-lg border border-line bg-black object-cover"
                muted
                playsInline
                autoPlay
                loop
                aria-label="Your Drop"
              />
              <div className="flex flex-col gap-2 text-sm">
                <span className="font-mono text-xs text-muted">
                  {formatDuration(video.duration)} · {(video.file.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <VideoPicker label="Change video" onFile={pickFile} disabled={busy} small />
              </div>
            </div>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <VideoPicker label="Record" capture onFile={pickFile} disabled={busy} />
              <VideoPicker label="Choose a video" onFile={pickFile} disabled={busy} />
            </div>
          )}
          <p className="mt-2 text-xs text-muted">Up to 60 seconds · MP4, WebM or MOV · 100 MB max</p>
          {videoError && <p className="mt-2 text-sm text-danger">{videoError}</p>}
        </section>

        {/* Step 2 */}
        <section aria-labelledby="step-link" className="flex flex-col gap-4">
          <StepTitle n={2} id="step-link">
            Your app
          </StepTitle>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Link to your live app</span>
            <input
              name="url"
              type="url"
              inputMode="url"
              autoComplete="url"
              required
              maxLength={500}
              placeholder="https://"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setLink({ state: "empty" });
              }}
              onBlur={(e) => void readSite(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text");
                setTimeout(() => void readSite(pasted), 0);
              }}
              className="field text-base"
            />
            {link.state === "reading" && <span className="text-xs text-muted">Reading your site…</span>}
            {link.message && (
              <span className={`text-xs ${link.state === "ok" ? "text-accent" : "text-danger"}`}>{link.message}</span>
            )}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input
                name="name"
                required
                maxLength={60}
                value={name}
                onChange={(e) => {
                  touched.current.name = true;
                  setName(e.target.value);
                }}
                className="field"
                placeholder="NoteFlow"
              />
            </Field>
            <Field label="Tagline" hint="One line: what it does">
              <input
                name="tagline"
                required
                maxLength={120}
                value={tagline}
                onChange={(e) => {
                  touched.current.tagline = true;
                  setTagline(e.target.value);
                }}
                className="field"
                placeholder="Meeting notes that turn into to-dos"
              />
            </Field>
          </div>

          <fieldset>
            <legend className="text-sm font-medium">Category</legend>
            <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category">
              {CATEGORIES.map((c) => (
                <Choice
                  key={c.slug}
                  selected={category === c.slug}
                  onClick={() => {
                    touched.current.category = true;
                    setCategory(c.slug);
                  }}
                >
                  {c.label}
                </Choice>
              ))}
            </div>
          </fieldset>

          <details className="group rounded-xl border border-line bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
              More details <span className="font-normal text-muted">Optional</span>
            </summary>
            <div className="flex flex-col gap-4 border-t border-line p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <fieldset>
                  <legend className="text-sm font-medium">Pricing</legend>
                  <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Pricing">
                    {PRICING.map((o) => (
                      <Choice key={o.slug} selected={pricing === o.slug} onClick={() => setPricing(o.slug)}>
                        {o.label}
                      </Choice>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="text-sm font-medium">Stage</legend>
                  <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Stage">
                    {STAGES.map((o) => (
                      <Choice key={o.slug} selected={stage === o.slug} onClick={() => setStage(o.slug)}>
                        {o.label}
                      </Choice>
                    ))}
                  </div>
                </fieldset>
              </div>
              <Field label="Built with" hint="Comma separated">
                <input
                  name="tech_stack"
                  value={techStack}
                  onChange={(e) => setTechStack(e.target.value)}
                  className="field"
                  placeholder="Next.js, Supabase, Lovable"
                />
              </Field>
              <Field label="Caption" hint="Shown on the Drop">
                <input
                  name="caption"
                  maxLength={300}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="field"
                  placeholder="Recorded a real standup and let it do the rest 👀"
                />
              </Field>
              <Field label="Description">
                <textarea
                  name="description"
                  maxLength={2000}
                  rows={4}
                  value={description}
                  onChange={(e) => {
                    touched.current.description = true;
                    setDescription(e.target.value);
                  }}
                  className="field"
                />
              </Field>
            </div>
          </details>
        </section>

        {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm">{error}</p>}

        <div className="sticky bottom-[calc(var(--tabbar)+0.75rem)] z-10 flex flex-col gap-1.5 rounded-xl border border-line bg-bg/90 p-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
          <button className="btn-accent w-full py-3 text-base sm:w-auto sm:self-start sm:px-8" disabled={busy}>
            Post Drop
          </button>
          {missing.length > 0 && <p className="text-xs text-muted">Still need: {missing.join(", ")}.</p>}
        </div>
      </form>
    </>
  );
}

function StepTitle({ n, id, children }: { n: number; id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="display flex items-baseline gap-2 text-3xl">
      <span className="font-mono text-xs text-accent">0{n} /</span>
      {children}
    </h2>
  );
}

function VideoPicker({
  label,
  capture = false,
  small = false,
  disabled,
  onFile,
}: {
  label: string;
  capture?: boolean;
  small?: boolean;
  disabled: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <label
      className={
        small
          ? "btn-ghost cursor-pointer px-3 py-1.5"
          : `flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center hover:border-accent ${
              capture ? "pointer-fine:hidden" : ""
            }`
      }
    >
      {!small && (
        <span className="text-2xl" aria-hidden>
          {capture ? "●" : "▶"}
        </span>
      )}
      <span className={small ? "" : "font-semibold"}>{label}</span>
      {!small && (
        <span className="text-xs text-muted">{capture ? "Use your camera" : "From your phone or computer"}</span>
      )}
      <input
        type="file"
        accept={capture ? "video/*" : DROP_VIDEO_TYPES.join(",")}
        capture={capture ? "environment" : undefined}
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
        className="sr-only"
        aria-label={capture ? "Record a video" : "Drop video"}
      />
    </label>
  );
}

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`rounded-md border px-3 py-2 text-sm ${
        selected ? "border-accent bg-accent font-semibold text-accent-ink" : "border-line bg-surface hover:border-muted"
      }`}
    >
      {children}
    </button>
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
