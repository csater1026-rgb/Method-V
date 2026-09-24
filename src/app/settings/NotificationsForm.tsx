"use client";

import { useEffect, useState, useTransition } from "react";

import { registerWebPush, saveNotificationSettings, unregisterWebPush } from "@/app/actions";

type Kinds = { follows: boolean; feedback: boolean; messages: boolean };

const KINDS: { key: keyof Kinds; label: string; hint: string }[] = [
  { key: "follows", label: "New followers", hint: "When someone follows you." },
  { key: "feedback", label: "Feedback on your apps", hint: "Tester feedback, comments on your Drops and questions about your apps." },
  { key: "messages", label: "Messages", hint: "Direct messages and connection requests." },
];

// "BEL..." (base64url) -> the bytes PushManager.subscribe wants.
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Push notifications: which kinds (saved as soon as you flip one), and
// whether this browser gets them. The phone app has its own switch on Me.
export function NotificationsForm({ initial, vapidKey, ready }: { initial: Kinds; vapidKey: string; ready: boolean }) {
  const [kinds, setKinds] = useState(initial);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function flip(key: keyof Kinds) {
    const next = { ...kinds, [key]: !kinds[key] };
    const prev = kinds;
    setKinds(next);
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const r = await saveNotificationSettings(next);
      if (r.ok) setSaved("Saved.");
      else {
        setKinds(prev);
        setError(r.error);
      }
    });
  }

  return (
    <section id="notifications" aria-label="Notifications" className="mt-10 scroll-mt-24 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="display text-4xl">Notifications</h2>
      <p className="mt-1 text-sm text-muted">
        Optional. Pick what you want to hear about, then turn notifications on for this browser or in the phone app.
      </p>
      {!ready && (
        <p className="mt-3 rounded-lg border border-line bg-bg p-3 text-sm text-muted">
          Notifications need the latest database update. Open /api/health to see what to run.
        </p>
      )}
      <ul className="mt-4 flex flex-col gap-2">
        {KINDS.map((k) => (
          <li key={k.key}>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-bg p-3 has-[:checked]:border-accent">
              <input
                type="checkbox"
                checked={kinds[k.key]}
                disabled={pending || !ready}
                onChange={() => flip(k.key)}
                className="mt-1 accent-[var(--color-accent)]"
              />
              <span>
                <span className="block font-semibold">{k.label}</span>
                <span className="block text-sm text-muted">{k.hint}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {saved && <p className="mt-2 text-sm text-accent">{saved}</p>}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <BrowserPush vapidKey={vapidKey} ready={ready} />
    </section>
  );
}

type BrowserState = "checking" | "unsupported" | "needs-install" | "blocked" | "off" | "on";

function BrowserPush({ vapidKey, ready }: { vapidKey: string; ready: boolean }) {
  const [state, setState] = useState<BrowserState>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      let next: BrowserState;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        next = ios && !installed ? "needs-install" : "unsupported";
      } else if (Notification.permission === "denied") {
        next = "blocked";
      } else {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        next = sub ? "on" : "off";
      }
      if (live) setState(next);
    })().catch(() => live && setState("unsupported"));
    return () => {
      live = false;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await registerWebPush(json);
      if (!r.ok) {
        await sub.unsubscribe();
        setError(r.error);
        return;
      }
      setState("on");
    } catch {
      setError("This browser couldn't turn notifications on.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unregisterWebPush(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  let note: string | null = null;
  if (!vapidKey) note = "Browser notifications aren't switched on for this site yet. The phone app can still get them.";
  else if (state === "needs-install") note = "On iPhone, add Method V to your Home Screen first (Share → Add to Home Screen), then turn this on from there.";
  else if (state === "unsupported") note = "This browser can't show notifications. Try Chrome, Edge, Firefox or Safari, or the phone app.";
  else if (state === "blocked") note = "Notifications are blocked for this site. Allow them in your browser's site settings, then come back.";

  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="font-semibold">This browser</p>
      {note ? (
        <p className="mt-1 text-sm text-muted">{note}</p>
      ) : state === "checking" ? (
        <p className="mt-1 text-sm text-muted">Checking…</p>
      ) : state === "on" ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="tag-accent">On</span>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => void turnOff()}>
            Turn off in this browser
          </button>
        </div>
      ) : (
        <button type="button" className="btn-accent mt-2" disabled={busy || !ready} onClick={() => void turnOn()}>
          {busy ? "Turning on…" : "Turn on notifications in this browser"}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
