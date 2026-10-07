"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createApp, previewLink } from "@/app/actions";
import { uploadAppCover } from "@/components/AppCover";
import { AppLogo } from "@/components/AppLogo";
import { uploadAppLogo } from "@/components/AppLogoUpload";
import { LoadingCoder } from "@/components/LoadingCoder";
import { VideoPicker } from "@/components/VideoPicker";
import { imageProblem } from "@/lib/crop-image";
import {
  CATEGORIES,
  MAX_DROP_MB,
  MAX_DROP_SECONDS,
  PRICING,
  SAFETY_AGREEMENT,
  SAFETY_CHECKLIST,
  STAGES,
  type Category,
} from "@/lib/constants";
import { formatDuration } from "@/lib/format";
import { readDropVideo, uploadDropVideo, type DropVideo } from "@/lib/drop-video";
import { clearPendingVideo, peekPendingVideo } from "@/lib/pending-video";
import { DEMO_MODE_MESSAGE, DROPS_BUCKET } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

type Video = DropVideo;
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
  const [safe, setSafe] = useState(false);
  // Optional cover image for the app's card (else the Drop's frame).
  const [cover, setCover] = useState<{ file: File; preview: string } | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  // Optional square logo (else the app's first letter on its own colors).
  const [logo, setLogo] = useState<{ file: File; preview: string } | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
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
    const read = await readDropVideo(file);
    if (read.ok) setVideo(read.video);
    else setVideoError(read.error);
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
    !url.trim() && "your link",
    !name.trim() && "a name",
    !tagline.trim() && "a tagline",
    !category && "a category",
    !safe && "the safety check",
  ].filter(Boolean) as string[];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!userId) {
      setError(DEMO_MODE_MESSAGE);
      return;
    }
    if (missing.length > 0) {
      setError(`Add ${missing.join(", ")}.`);
      return;
    }

    const supabase = createClient();
    const bucket = supabase.storage.from(DROPS_BUCKET);
    const uploaded: string[] = [];
    let videoPath: string | null = null;
    let posterPath: string | null = null;

    setStep("uploading");
    // The video is optional; without one the app still goes on Browse and your profile.
    if (video) {
      const up = await uploadDropVideo(userId, video);
      if (!up.ok) {
        setStep("idle");
        setError(up.error);
        return;
      }
      videoPath = up.videoPath;
      posterPath = up.posterPath;
      uploaded.push(videoPath, ...(posterPath ? [posterPath] : []));
    }

    let coverPath: string | null = null;
    if (cover) {
      const up = await uploadAppCover(userId, cover.file);
      if ("error" in up) {
        await bucket.remove(uploaded);
        setStep("idle");
        setError(`Cover image: ${up.error}`);
        return;
      }
      coverPath = up.path;
      uploaded.push(up.path);
    }

    let logoPath: string | null = null;
    if (logo) {
      const up = await uploadAppLogo(userId, logo.file);
      if ("error" in up) {
        await bucket.remove(uploaded);
        setStep("idle");
        setError(`Logo: ${up.error}`);
        return;
      }
      logoPath = up.path;
      uploaded.push(up.path);
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
      posterPath: posterPath && uploaded.includes(posterPath) ? posterPath : null,
      durationSeconds: video ? video.duration : null,
      safetyChecked: safe,
      coverPath,
      logoPath,
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
          <LoadingCoder message={step === "uploading" ? (video ? "Uploading your Drop…" : "Uploading…") : "Checking your link and posting…"} />
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-8">
        {/* Step 1 */}
        <section aria-labelledby="step-video">
          <StepTitle n={1} id="step-video">
            Your Drop <span className="text-base font-normal text-muted normal-case">(optional)</span>
          </StepTitle>
          {video ? (
            <div className="mt-3 flex items-end gap-4">
              <video
                src={video.url}
                className={`${video.landscape ? "aspect-video w-48" : "aspect-[9/16] w-28"} rounded-lg border border-line bg-black object-contain`}
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
          <p className="mt-2 text-xs text-muted">
            Up to {MAX_DROP_SECONDS} seconds · MP4, WebM or MOV · {MAX_DROP_MB} MB max · vertical (9:16) or horizontal (16:9). A quick screen
            recording of your app is perfect.
          </p>
          {!video && (
            <p className="mt-1 text-xs text-muted">
              No video yet? You can post without one. Your app still shows on Browse and your profile (add a cover image below so its card
              isn&apos;t blank), but apps with a Drop also go in the Drops feed and get far more tries.
            </p>
          )}
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

          {/* The app's logo, next to its name on cards. Optional: without one, its first letter on its own colors. */}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              Logo <span className="font-normal text-muted">· Optional. Shows next to your app&apos;s name on Home and Browse.</span>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <AppLogo name={name || "?"} src={logo?.preview ?? null} size={64} className="border border-line" />
              <label className="btn-ghost cursor-pointer">
                {logo ? "Change logo" : "Add a logo"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Logo image"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    const problem = imageProblem(file);
                    setLogoError(problem);
                    if (!problem) {
                      if (logo) URL.revokeObjectURL(logo.preview);
                      setLogo({ file, preview: URL.createObjectURL(file) });
                    }
                  }}
                />
              </label>
              {logo && (
                <button
                  type="button"
                  className="text-sm text-muted hover:text-ink"
                  onClick={() => {
                    URL.revokeObjectURL(logo.preview);
                    setLogo(null);
                  }}
                >
                  Remove
                </button>
              )}
              <p className="text-xs text-muted">Square works best, like an app icon.</p>
            </div>
            {logoError && <p className="text-sm text-danger">{logoError}</p>}
          </div>

          {/* The picture on the app's card (Browse, Featured). Optional: without one, cards use the Drop's frame. */}
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              Cover image <span className="font-normal text-muted">· Optional. Shows on Browse and Featured; otherwise we use a frame from your Drop.</span>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="aspect-video w-40 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover.preview} alt="Your cover image" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-muted">16:9</div>
                )}
              </div>
              <label className="btn-ghost cursor-pointer">
                {cover ? "Change cover" : "Add a cover image"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="Cover image"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    const problem = imageProblem(file);
                    setCoverError(problem);
                    if (!problem) {
                      if (cover) URL.revokeObjectURL(cover.preview);
                      setCover({ file, preview: URL.createObjectURL(file) });
                    }
                  }}
                />
              </label>
              {cover && (
                <button
                  type="button"
                  className="text-sm text-muted hover:text-ink"
                  onClick={() => {
                    URL.revokeObjectURL(cover.preview);
                    setCover(null);
                  }}
                >
                  Remove
                </button>
              )}
            </div>
            {coverError && <p className="text-sm text-danger">{coverError}</p>}
          </div>

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

        {/* Before posting: the app is the builder's, and so is its security. */}
        <section aria-label="Safety check" className="rounded-xl border border-line bg-surface p-4">
          <h2 className="display text-3xl">Quick safety check</h2>
          <p className="mt-1 text-sm text-muted">
            People will try your app from here, so make sure it keeps them safe. The basics most vibe-coded apps miss:
          </p>
          {/^http:\/\//i.test(url.trim()) && (
            <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
              Your link starts with http://, not https://. Browsers will warn testers that it isn&apos;t secure.
            </p>
          )}
          <ul className="mt-3 flex flex-col gap-2.5">
            {SAFETY_CHECKLIST.map((item) => (
              <li key={item.title} className="flex gap-2.5 text-sm">
                <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rotate-45 bg-accent" />
                <span>
                  <strong>{item.title}.</strong> <span className="text-muted">{item.body}</span>
                </span>
              </li>
            ))}
          </ul>
          <label className="mt-4 flex items-start gap-2.5 text-sm font-medium">
            <input
              type="checkbox"
              checked={safe}
              onChange={(e) => setSafe(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
            />
            <span>{SAFETY_AGREEMENT}</span>
          </label>
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
