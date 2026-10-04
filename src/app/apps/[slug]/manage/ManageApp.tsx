"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { addDropToApp, changeAppLink, deleteMyApp, editDropCaption, removeDrop, updateAppDetails } from "@/app/actions";
import { DropPlaceholder } from "@/components/DropVideo";
import { VideoPicker } from "@/components/VideoPicker";
import { CATEGORIES, MAX_DROP_MB, MAX_DROP_SECONDS, PRICING, STAGES } from "@/lib/constants";
import { readDropVideo, uploadDropVideo, type DropVideo } from "@/lib/drop-video";
import { formatCount, formatDuration, timeAgo } from "@/lib/format";
import { DROPS_BUCKET } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";
import type { App, Drop } from "@/lib/types";

// ---------------------------------------------------------------------------
// Drops: add one, change a caption, or delete one
// ---------------------------------------------------------------------------

export function ManageDrops({ appId, appSlug, appName, userId, drops }: { appId: string; appSlug: string; appName: string; userId: string; drops: Drop[] }) {
  return (
    <section aria-labelledby="manage-drops" className="mt-10">
      <h2 id="manage-drops" className="display text-3xl">
        Drops <span className="text-xl text-muted">{drops.length}</span>
      </h2>
      <p className="mt-1 text-sm text-muted">
        Your newest Drop shows on your app&apos;s page. Every Drop goes in the feed. Add a new one whenever you ship something.
      </p>
      <AddDrop appId={appId} userId={userId} />
      {drops.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {drops.map((drop) => (
            <li key={drop.id}>
              <DropRow drop={drop} appSlug={appSlug} appName={appName} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AddDrop({ appId, userId }: { appId: string; userId: string }) {
  const router = useRouter();
  const [video, setVideo] = useState<DropVideo | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      if (video) URL.revokeObjectURL(video.url);
    },
    [video],
  );

  async function pick(file: File) {
    setError(null);
    setVideo(null);
    const read = await readDropVideo(file);
    if (read.ok) setVideo(read.video);
    else setError(read.error);
  }

  async function post() {
    if (!video) return;
    setBusy(true);
    setError(null);
    try {
      const up = await uploadDropVideo(userId, video);
      if (!up.ok) return setError(up.error);
      const saved = await addDropToApp(appId, { videoPath: up.videoPath, posterPath: up.posterPath, durationSeconds: video.duration, caption });
      if (!saved.ok) {
        await createClient()
          .storage.from(DROPS_BUCKET)
          .remove([up.videoPath, ...(up.posterPath ? [up.posterPath] : [])]);
        return setError(saved.error);
      }
      setVideo(null);
      setCaption("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-4">
      {video ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <video src={video.url} muted playsInline controls className={`${video.landscape ? "aspect-video w-48" : "aspect-[9/16] w-28"} shrink-0 rounded-lg border border-line bg-black object-contain`} />
          <div className="flex flex-1 flex-col gap-2">
            <p className="text-sm text-muted">{formatDuration(video.duration)} · ready to post</p>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                Caption <span className="font-normal text-muted">· Optional</span>
              </span>
              <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} placeholder="What's new?" className="field" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-accent" disabled={busy} onClick={() => void post()}>
                {busy ? "Uploading…" : "Post this Drop"}
              </button>
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => setVideo(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <VideoPicker label="+ Add a Drop" small disabled={busy} onFile={(f) => void pick(f)} />
          <span className="text-xs text-muted">
            Up to {MAX_DROP_SECONDS} seconds · MP4, WebM or MOV · {MAX_DROP_MB} MB max
          </span>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

function DropRow({ drop, appSlug, appName }: { drop: Drop; appSlug: string; appName: string }) {
  const router = useRouter();
  const [caption, setCaption] = useState(drop.caption);
  const [saved, setSaved] = useState(drop.caption);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function saveCaption() {
    setNote(null);
    startTransition(async () => {
      const r = await editDropCaption(drop.id, appSlug, caption);
      if (!r.ok) return setNote({ ok: false, text: r.error });
      setSaved(caption.trim());
      setNote({ ok: true, text: "Saved." });
    });
  }

  function remove() {
    if (!window.confirm("Delete this Drop? The video, its likes and comments go for good.")) return;
    setNote(null);
    startTransition(async () => {
      const r = await removeDrop(drop.id, appSlug);
      if (!r.ok) return setNote({ ok: false, text: r.error });
      router.refresh();
    });
  }

  return (
    <article className="flex gap-3 rounded-xl border border-line bg-surface p-3">
      <a href={`/drops?d=${drop.id}`} className="media-dark relative aspect-[9/16] w-20 shrink-0 overflow-hidden rounded-lg border border-line bg-bg">
        {drop.poster_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={drop.poster_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <DropPlaceholder name={appName} category="other" variant="bare" />
        )}
        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 font-mono text-[10px] text-white">{formatDuration(drop.duration_seconds)}</span>
      </a>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="font-mono text-xs text-muted" suppressHydrationWarning>
          Posted {timeAgo(drop.created_at)} · ♥ {formatCount(drop.like_count)} · 💬 {formatCount(drop.comment_count)}
        </p>
        <label className="flex flex-col gap-1">
          <span className="sr-only">Caption</span>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} placeholder="Add a caption" className="field py-1.5 text-sm" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {caption.trim() !== saved && (
            <button type="button" className="btn-accent px-3 py-1 text-xs" disabled={pending} onClick={saveCaption}>
              Save caption
            </button>
          )}
          <button type="button" className="btn-ghost px-3 py-1 text-xs hover:text-danger" disabled={pending} onClick={remove}>
            Delete Drop
          </button>
          {note && <span className={`text-xs ${note.ok ? "text-accent" : "text-danger"}`}>{note.text}</span>}
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Details and link
// ---------------------------------------------------------------------------

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly { slug: string; label: string }[] }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field">
        {options.map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AppDetailsForm({ app }: { app: App }) {
  const router = useRouter();
  const [name, setName] = useState(app.name);
  const [tagline, setTagline] = useState(app.tagline);
  const [description, setDescription] = useState(app.description ?? "");
  const [category, setCategory] = useState<string>(app.category);
  const [pricing, setPricing] = useState<string>(app.pricing);
  const [stage, setStage] = useState<string>(app.stage);
  const [techStack, setTechStack] = useState(app.tech_stack.join(", "));
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setNote(null);
    startTransition(async () => {
      const r = await updateAppDetails(app.id, { name, tagline, description, category, pricing, stage, techStack });
      if (!r.ok) return setNote({ ok: false, text: r.error });
      setNote({ ok: true, text: "Saved." });
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="manage-details" className="mt-10">
      <h2 id="manage-details" className="display text-3xl">
        Details
      </h2>
      <form onSubmit={save} className="mt-3 flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} className="field" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Tagline</span>
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} required maxLength={120} className="field" />
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={4} className="field" />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Category" value={category} onChange={setCategory} options={CATEGORIES} />
          <Select label="Pricing" value={pricing} onChange={setPricing} options={PRICING} />
          <Select label="Stage" value={stage} onChange={setStage} options={STAGES} />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            Built with <span className="font-normal text-muted">· Comma separated</span>
          </span>
          <input value={techStack} onChange={(e) => setTechStack(e.target.value)} placeholder="Next.js, Supabase" className="field" />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-accent" disabled={pending}>
            {pending ? "Saving…" : "Save details"}
          </button>
          {note && <span className={`text-sm ${note.ok ? "text-accent" : "text-danger"}`}>{note.text}</span>}
        </div>
      </form>
    </section>
  );
}

export function AppLinkForm({ appId, url }: { appId: string; url: string }) {
  const router = useRouter();
  const [value, setValue] = useState(url);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setNote(null);
    startTransition(async () => {
      const r = await changeAppLink(appId, value);
      if (!r.ok) return setNote({ ok: false, text: r.error });
      setNote({ ok: true, text: "Link checked and saved." });
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="manage-link" className="mt-10">
      <h2 id="manage-link" className="display text-3xl">
        Link
      </h2>
      <p className="mt-1 text-sm text-muted">Where Try it sends people. A new link is checked to make sure it loads before it&apos;s saved.</p>
      <form onSubmit={save} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">Link to your live app</span>
          <input type="url" value={value} onChange={(e) => setValue(e.target.value)} required placeholder="https://" className="field w-full" />
        </label>
        <button className="btn-accent" disabled={pending || value.trim() === url}>
          {pending ? "Checking…" : "Save link"}
        </button>
      </form>
      {note && <p className={`mt-2 text-sm ${note.ok ? "text-accent" : "text-danger"}`}>{note.text}</p>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Delete the app
// ---------------------------------------------------------------------------

export function DeleteAppForm({ appId, appName, username }: { appId: string; appName: string; username: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await deleteMyApp(appId, typed);
      if (!r.ok) return setError(r.error);
      router.push(username ? `/u/${username}` : "/");
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="manage-delete" className="mt-12 rounded-xl border border-danger/40 p-4">
      <h2 id="manage-delete" className="font-semibold text-danger">
        Delete this app
      </h2>
      <p className="mt-1 text-sm text-muted">
        Removes the app, all its Drops, likes, comments, feedback and Q&amp;A for good. Testers you paid for but haven&apos;t used yet come
        back as credits.
      </p>
      {open ? (
        <form onSubmit={remove} className="mt-3 flex flex-col gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm">
              Type <strong>{appName}</strong> to confirm
            </span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="field" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost border-danger text-danger" disabled={pending || typed.trim().toLowerCase() !== appName.trim().toLowerCase()}>
              {pending ? "Deleting…" : "Delete forever"}
            </button>
            <button type="button" className="btn-ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>
      ) : (
        <button type="button" className="btn-ghost mt-3 text-danger" onClick={() => setOpen(true)}>
          Delete app…
        </button>
      )}
    </section>
  );
}
