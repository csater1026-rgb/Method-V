"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { cancelTesters, markHelpful, replyToFeedback, requestTesters, submitFeedback } from "@/app/actions";
import { CREDITS, MAX_FEEDBACK_SHOTS, TESTER_GUARANTEE, TESTER_PACKS, WOULD_USE, labelFor } from "@/lib/constants";
import { imageProblem, shrinkToJpeg } from "@/lib/crop-image";
import { timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { FEEDBACK_BUCKET } from "@/lib/supabase/env";
import type { Feedback, FeedbackPanel as Panel, TestRequest } from "@/lib/types";

import { Avatar } from "./Avatar";
import { RankTag } from "./Passport";
import { Handle } from "./Handle";
import { Coin } from "./Coin";
import { TipButton } from "./TipButton";

type AppRef = { id: string; slug: string; name: string };

// Structured feedback and try-to-earn credits on an app page. What shows
// depends on who's looking: the builder, a signed-in tester, or a visitor.
export function FeedbackPanel({ panel, app }: { panel: Panel; app: AppRef }) {
  const open = panel.request && panel.request.slots_filled < panel.request.slots_total ? panel.request : null;

  return (
    <section id="feedback" className="scroll-mt-20 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="display text-4xl">Test &amp; earn</h2>
        {open && panel.mode !== "owner" && (
          <span className="tag-accent">
            <Coin />
            Earn {CREDITS.feedbackReward} Methodium · {open.slots_total - open.slots_filled} spots left
          </span>
        )}
      </div>

      {panel.mode !== "owner" && (
        <ol className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <HowStep n={1} title="Try it">
            Use {app.name} for a minute.
          </HowStep>
          <HowStep n={2} title="Give feedback">
            Would you use it? What worked, what didn&apos;t? Only the builder sees it.
          </HowStep>
          <HowStep
            n={3}
            title={
              <>
                Earn <Coin />
                {CREDITS.feedbackReward}
              </>
            }
          >
            Credits here are called Methodium. Spend them to get testers for your own app.
          </HowStep>
        </ol>
      )}

      {panel.mode === "demo" && (
        <p className="mt-2 text-sm text-muted">
          Testers who try an app and leave honest feedback earn credits, called Methodium, and builders spend them to get testers. It&apos;s
          off in demo mode.
        </p>
      )}

      {panel.mode === "signed-out" && (
        <p className="mt-2 text-sm text-muted">
          <Link href={`/login?next=${encodeURIComponent(`/apps/${app.slug}#feedback`)}`} className="text-accent hover:underline">
            Sign in
          </Link>{" "}
          to try {app.name}, give feedback{open ? ` and earn ${CREDITS.feedbackReward} Methodium` : ""}.
        </p>
      )}

      {panel.mode === "tester" &&
        (panel.mine ? (
          <div className="mt-3">
            <p className="text-sm text-muted">
              {panel.mine.earned > 0
                ? `Thanks! You earned ${panel.mine.earned} Methodium for this.`
                : "Thanks! Your feedback went to the builder."}{" "}
              Only you and the builder can see it.
            </p>
            <FeedbackItem item={panel.mine} />
          </div>
        ) : panel.tried ? (
          <FeedbackForm app={app} open={open} />
        ) : (
          <TryFirst app={app} open={open} />
        ))}

      {panel.mode === "owner" && (
        <OwnerView app={app} request={panel.request} feedback={panel.feedback} credits={panel.credits} />
      )}
    </section>
  );
}

function HowStep({ n, title, children }: { n: number; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="rounded-lg border border-line bg-bg p-3">
      <span className="eyebrow">0{n}</span>
      <span className="ml-2 font-semibold">{title}</span>
      <p className="mt-1 text-muted">{children}</p>
    </li>
  );
}

function TryFirst({ app, open }: { app: AppRef; open: TestRequest | null }) {
  const router = useRouter();
  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className="text-sm text-muted">
        Open {app.name} with Try it, use it for a minute, then come back here to give feedback
        {open ? ` and earn ${CREDITS.feedbackReward} Methodium` : ""}.
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={`/try/${app.slug}?via=page`}
          target="_blank"
          rel="noopener"
          className="btn-accent"
          // Once the try is recorded, the form can show.
          onClick={() => setTimeout(() => router.refresh(), 2000)}
        >
          Try it →
        </a>
        <button type="button" className="btn-ghost" onClick={() => router.refresh()}>
          I&apos;ve tried it
        </button>
      </div>
    </div>
  );
}

type Shot = { file: File; preview: string };

// Shrinks each picked screenshot and uploads it into the tester's own folder
// of the private feedback bucket. Returns the paths, or an error (and removes
// anything that did upload).
async function uploadShots(shots: Shot[]): Promise<{ paths: string[] } | { error: string }> {
  if (shots.length === 0) return { paths: [] };
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Sign in again to add screenshots." };
  const bucket = supabase.storage.from(FEEDBACK_BUCKET);
  const paths: string[] = [];
  for (const shot of shots) {
    let picture: Blob;
    try {
      picture = await shrinkToJpeg(shot.file);
    } catch {
      if (paths.length) await bucket.remove(paths);
      return { error: "Couldn't read one of your screenshots. Try a PNG or JPG." };
    }
    const path = `${data.user.id}/fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const up = await bucket.upload(path, picture, { contentType: "image/jpeg", upsert: false });
    if (up.error) {
      if (paths.length) await bucket.remove(paths);
      return {
        error: /bucket not found/i.test(up.error.message)
          ? "Screenshots can't be added right now. Remove them to send your feedback."
          : "Couldn't upload your screenshots. Check your connection and try again.",
      };
    }
    paths.push(path);
  }
  return { paths };
}

function FeedbackForm({ app, open }: { app: AppRef; open: TestRequest | null }) {
  const [wouldUse, setWouldUse] = useState<string>("");
  const [rating, setRating] = useState(0);
  const [workedShots, setWorkedShots] = useState<Shot[]>([]);
  const [confusingShots, setConfusingShots] = useState<Shot[]>([]);
  const [uploading, setUploading] = useState(false);
  const [workedLength, setWorkedLength] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      setUploading(workedShots.length + confusingShots.length > 0);
      const worked = await uploadShots(workedShots);
      const confusing = "error" in worked ? worked : await uploadShots(confusingShots);
      setUploading(false);
      if ("error" in worked || "error" in confusing) {
        if ("paths" in worked) await createClient().storage.from(FEEDBACK_BUCKET).remove(worked.paths);
        return setError("error" in worked ? worked.error : "error" in confusing ? confusing.error : null);
      }
      const result = await submitFeedback(app.id, app.slug, {
        wouldUse,
        rating,
        worked: String(formData.get("worked") ?? ""),
        confusing: String(formData.get("confusing") ?? ""),
        workedShots: worked.paths,
        confusingShots: confusing.paths,
      });
      if (!result.ok) {
        const uploaded = [...worked.paths, ...confusing.paths];
        if (uploaded.length) await createClient().storage.from(FEEDBACK_BUCKET).remove(uploaded);
        setError(result.error);
      }
    });
  }

  return (
    <form action={submit} className="mt-3 flex flex-col gap-4">
      <p className="text-sm text-muted">
        Honest and specific helps most. Only the builder sees what you write.
      </p>
      {open && (
        <p className="rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-sm">
          <strong>To earn Methodium:</strong> use the app for at least a minute after tapping Try it, and write a couple of sentences
          ({TESTER_GUARANTEE.minChars}+ characters) about what worked.
        </p>
      )}

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Would you use it?</legend>
        <div className="flex gap-2">
          {WOULD_USE.map((o) => (
            <label
              key={o.slug}
              className="cursor-pointer rounded-md border border-line px-4 py-2 text-sm font-semibold has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-accent-ink"
            >
              <input
                type="radio"
                name="would_use"
                value={o.slug}
                checked={wouldUse === o.slug}
                onChange={() => setWouldUse(o.slug)}
                className="sr-only"
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Rating</legend>
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onClick={() => setRating(n)}
              className={`text-2xl leading-none ${n <= rating ? "text-accent" : "text-line hover:text-muted"}`}
            >
              ★
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="fb-worked" className="text-sm font-medium">
          What worked?
        </label>
        <textarea
          id="fb-worked"
          name="worked"
          required
          minLength={10}
          maxLength={1000}
          rows={3}
          className="field"
          onPaste={(e) => pasteShots(e, workedShots, setWorkedShots, setError)}
          onChange={(e) => setWorkedLength(e.target.value.trim().length)}
        />
        {open && (
          <span className={`text-xs ${workedLength >= TESTER_GUARANTEE.minChars ? "text-accent" : "text-muted"}`} aria-live="polite">
            {workedLength >= TESTER_GUARANTEE.minChars
              ? "✓ Long enough to earn Methodium"
              : `${workedLength}/${TESTER_GUARANTEE.minChars} characters to earn Methodium`}
          </span>
        )}
        <ShotPicker label="What worked" shots={workedShots} onChange={setWorkedShots} onError={setError} disabled={pending} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="fb-confusing" className="text-sm font-medium">
          What confused you? <span className="font-normal text-muted">· Optional</span>
        </label>
        <textarea
          id="fb-confusing"
          name="confusing"
          maxLength={1000}
          rows={3}
          className="field"
          onPaste={(e) => pasteShots(e, confusingShots, setConfusingShots, setError)}
        />
        <ShotPicker label="What confused you" shots={confusingShots} onChange={setConfusingShots} onError={setError} disabled={pending} />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      <button className="btn-accent self-start" disabled={pending || !wouldUse || rating === 0}>
        {uploading ? "Uploading screenshots…" : pending ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}

// Adds picked or pasted images to a list, up to MAX_FEEDBACK_SHOTS.
function addShots(files: File[], shots: Shot[], onChange: (s: Shot[]) => void, onError: (e: string | null) => void) {
  const images = files.filter((f) => f.type.startsWith("image/"));
  if (images.length === 0) return;
  const room = MAX_FEEDBACK_SHOTS - shots.length;
  if (room <= 0) return onError(`You can add up to ${MAX_FEEDBACK_SHOTS} screenshots to each answer.`);
  const problem = images.map(imageProblem).find(Boolean);
  if (problem) return onError(problem);
  onError(images.length > room ? `You can add up to ${MAX_FEEDBACK_SHOTS} screenshots to each answer, so only the first ${room} were added.` : null);
  onChange([...shots, ...images.slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
}

// Pasting a screenshot (Ctrl+V / Cmd+V) into an answer adds it to that answer.
function pasteShots(
  e: React.ClipboardEvent,
  shots: Shot[],
  onChange: (s: Shot[]) => void,
  onError: (e: string | null) => void,
) {
  const files = Array.from(e.clipboardData.files ?? []);
  if (!files.some((f) => f.type.startsWith("image/"))) return;
  e.preventDefault();
  addShots(files, shots, onChange, onError);
}

// Up to 3 screenshots on an answer: thumbnails with a remove button, and an
// "Add screenshot" button. On a computer you can also paste one into the box.
function ShotPicker({
  label,
  shots,
  onChange,
  onError,
  disabled,
}: {
  label: string;
  shots: Shot[];
  onChange: (s: Shot[]) => void;
  onError: (e: string | null) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  // Free the previews when the form goes away.
  const latest = useRef(shots);
  useEffect(() => {
    latest.current = shots;
  }, [shots]);
  useEffect(() => () => latest.current.forEach((s) => URL.revokeObjectURL(s.preview)), []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {shots.map((shot, i) => (
        <div key={shot.preview} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.preview} alt={`${label} screenshot ${i + 1}`} className="h-16 w-auto max-w-28 rounded-md border border-line object-cover" />
          <button
            type="button"
            disabled={disabled}
            aria-label={`Remove ${label.toLowerCase()} screenshot ${i + 1}`}
            onClick={() => {
              URL.revokeObjectURL(shot.preview);
              onChange(shots.filter((s) => s !== shot));
            }}
            className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-xs hover:text-danger"
          >
            ✕
          </button>
        </div>
      ))}
      {shots.length < MAX_FEEDBACK_SHOTS && (
        <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="btn-ghost px-3 py-1.5 text-xs">
          + Add screenshot{shots.length ? "" : "s"}
        </button>
      )}
      <span className="text-xs text-muted">
        {shots.length}/{MAX_FEEDBACK_SHOTS}
        <span className="hidden sm:inline"> · or paste one into the box</span>
      </span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label={`${label} screenshots`}
        onChange={(e) => {
          addShots(Array.from(e.target.files ?? []), shots, onChange, onError);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// Screenshots on a sent answer; tap one to open it full size.
function ShotList({ urls, label }: { urls: string[]; label: string }) {
  if (urls.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {urls.map((url, i) => (
        <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`${label} screenshot ${i + 1}`}
            loading="lazy"
            className="h-28 w-auto max-w-[45vw] rounded-md border border-line object-cover hover:border-accent sm:max-w-60"
          />
        </a>
      ))}
    </div>
  );
}

function OwnerView({
  app,
  request,
  feedback,
  credits,
}: {
  app: AppRef;
  request: TestRequest | null;
  feedback: Feedback[];
  credits: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const open = request && request.slots_filled < request.slots_total ? request : null;

  function buy(testers: number) {
    setError(null);
    startTransition(async () => {
      const result = await requestTesters(app.id, app.slug, testers);
      if (!result.ok) setError(result.error);
    });
  }

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelTesters(app.id, app.slug);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-5">
      <div className="rounded-lg border border-line bg-bg/50 p-4">
        <h3 className="display text-2xl">Get testers</h3>
        {open ? (
          <>
            <p className="mt-1 text-sm text-muted">
              {app.name} is in the Test &amp; earn queue: <strong className="text-ink">{open.slots_filled}</strong> of {open.slots_total}{" "}
              testers so far.
              {open.expires_at && (
                <>
                  {" "}
                  Any spots still open on{" "}
                  <span suppressHydrationWarning>{new Date(open.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>{" "}
                  come back to you automatically.
                </>
              )}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full bg-accent" style={{ width: `${(open.slots_filled / open.slots_total) * 100}%` }} />
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">
            Put {app.name} in the Test &amp; earn queue, where people try apps and give feedback for Methodium. Each tester is{" "}
            {CREDITS.perTester} credits.
          </p>
        )}
        <div className="mt-3 rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm">
          <p className="font-semibold">Real testers, or your credits back</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
            <li>Your credits are held, not spent. A spot is only used when someone opens {app.name} with Try it, uses it for at least a minute, and writes real feedback (a couple of sentences).</li>
            <li>Spots nobody fills within {TESTER_GUARANTEE.days} days come back to you automatically.</li>
            <li>Stop any time to get unused spots back right away.</li>
          </ul>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {TESTER_PACKS.map((n) => {
            const cost = n * CREDITS.perTester;
            return (
              <button
                key={n}
                type="button"
                onClick={() => buy(n)}
                disabled={pending || credits < cost}
                className="btn-ghost"
              >
                +{n} testers · <Coin />
                {cost}
              </button>
            );
          })}
          {open && (
            <button type="button" onClick={cancel} disabled={pending} className="text-sm text-muted hover:text-danger">
              Stop and refund <Coin />
              {(open.slots_total - open.slots_filled) * CREDITS.perTester}
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">
          You have <Coin />
          {credits}.{" "}
          <Link href="/test" className="text-accent hover:underline">
            Test other apps
          </Link>{" "}
          to earn more.
        </p>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>

      {feedback.length === 0 ? (
        <p className="text-sm text-muted">No feedback yet. It shows up here, and only you can see it.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {feedback.map((item) => (
            <li key={item.id}>
              <FeedbackItem item={item} appSlug={app.slug} canMarkHelpful />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FeedbackItem({ item, appSlug, canMarkHelpful }: { item: Feedback; appSlug?: string; canMarkHelpful?: boolean }) {
  const [helpful, setHelpful] = useState(Boolean(item.helpful_at));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function mark() {
    if (!appSlug) return;
    setError(null);
    startTransition(async () => {
      const result = await markHelpful(item.id, appSlug);
      if (result.ok) setHelpful(true);
      else setError(result.error);
    });
  }

  return (
    <article className="mt-3 rounded-lg border border-line bg-bg/50 p-4 text-sm">
      <header className="flex flex-wrap items-center gap-2">
        <Link href={`/u/${item.user.username}`} className="flex items-center gap-2 font-semibold hover:underline">
          <Avatar username={item.user.username} name={item.user.display_name} src={item.user.avatar_url} size={24} /><Handle username={item.user.username} />
        </Link>
        <RankTag rank={item.user_rank} />
        <span className="text-accent" aria-label={`${item.rating} out of 5 stars`}>
          {"★".repeat(item.rating)}
          <span className="text-line">{"★".repeat(5 - item.rating)}</span>
        </span>
        <span className="tag">Would use: {labelFor(WOULD_USE, item.would_use)}</span>
        <span className="ml-auto text-xs text-muted" suppressHydrationWarning>
          {timeAgo(item.created_at)}
        </span>
      </header>
      <p className="mt-3 text-xs font-semibold text-muted uppercase">What worked</p>
      <p className="mt-0.5 break-words whitespace-pre-line">{item.worked}</p>
      <ShotList urls={item.worked_shots} label="What worked" />
      {(item.confusing || item.confusing_shots.length > 0) && (
        <>
          <p className="mt-3 text-xs font-semibold text-muted uppercase">What was confusing</p>
          {item.confusing && <p className="mt-0.5 break-words whitespace-pre-line">{item.confusing}</p>}
          <ShotList urls={item.confusing_shots} label="What was confusing" />
        </>
      )}
      {canMarkHelpful && appSlug ? (
        <ReplyBox item={item} appSlug={appSlug} />
      ) : (
        item.reply && (
          <div className="mt-3 rounded-lg border-l-2 border-accent bg-surface px-3 py-2">
            <p className="text-xs font-semibold text-muted uppercase">The builder replied</p>
            <p className="mt-0.5 break-words whitespace-pre-line">{item.reply}</p>
          </div>
        )
      )}
      {canMarkHelpful && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            {helpful ? (
              <span className="text-xs text-accent">✓ Marked helpful</span>
            ) : (
              <button type="button" onClick={mark} disabled={pending} className="btn-ghost px-3 py-1 text-xs">
                Mark helpful · gives them <Coin />
                {CREDITS.helpfulBonus}
              </button>
            )}
            <TipButton to={{ id: item.user.id, username: item.user.username }} label="Tip them" small />
          </div>
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        </div>
      )}
    </article>
  );
}

// The builder's reply on a piece of feedback: write one, change it or take it
// back. Only the tester and the builder see it; the tester gets a notification.
function ReplyBox({ item, appSlug }: { item: Feedback; appSlug: string }) {
  const [reply, setReply] = useState(item.reply);
  const [draft, setDraft] = useState(item.reply);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(text: string) {
    setError(null);
    startTransition(async () => {
      const result = await replyToFeedback(item.id, appSlug, text);
      if (!result.ok) return setError(result.error);
      setReply(text.trim());
      setDraft(text.trim());
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <div className="mt-3 flex flex-col gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted uppercase">Your reply</span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={1000}
            rows={3}
            autoFocus
            placeholder={`Thanks @${item.user.username}! …`}
            className="field"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-accent px-3 py-1.5 text-xs" disabled={pending || !draft.trim()} onClick={() => save(draft)}>
            {pending ? "Sending…" : reply ? "Save reply" : "Send reply"}
          </button>
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={() => {
              setDraft(reply);
              setEditing(false);
              setError(null);
            }}
          >
            Cancel
          </button>
        </div>
        <p className="text-xs text-muted">Only they can see it, and they&apos;ll get a notification.</p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }

  if (!reply) {
    return (
      <div className="mt-3">
        <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setEditing(true)}>
          ↩ Reply
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border-l-2 border-accent bg-surface px-3 py-2">
      <p className="text-xs font-semibold text-muted uppercase">Your reply</p>
      <p className="mt-0.5 break-words whitespace-pre-line">{reply}</p>
      <div className="mt-1.5 flex gap-3 text-xs">
        <button type="button" className="text-accent hover:underline" disabled={pending} onClick={() => setEditing(true)}>
          Edit
        </button>
        <button type="button" className="text-muted hover:text-danger" disabled={pending} onClick={() => save("")}>
          {pending ? "Removing…" : "Remove"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
