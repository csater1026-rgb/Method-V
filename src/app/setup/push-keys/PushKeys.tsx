"use client";

import { useEffect, useState } from "react";

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

type Keys = { publicKey: string; privateKey: string; secret: string };

// A VAPID key pair (P-256) for browser push, and a random webhook secret.
async function makeKeys(): Promise<Keys> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  const privateKey = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d ?? "";
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  return { publicKey, privateKey, secret };
}

export function PushKeys() {
  const [keys, setKeys] = useState<Keys | null>(null);
  useEffect(() => {
    void makeKeys().then(setKeys);
  }, []);
  if (!keys) return <p className="mt-6 text-muted">Making keys…</p>;
  const rows: [string, string, string, string][] = [
    ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", keys.publicKey, "Config", "Browser notifications (public)."],
    ["VAPID_PRIVATE_KEY", keys.privateKey, "Secret", "Browser notifications (keep private)."],
    ["PUSH_WEBHOOK_SECRET", keys.secret, "Secret", "Also paste into the Supabase webhook as the x-push-secret header."],
  ];
  return (
    <dl className="mt-6 flex flex-col gap-4">
      {rows.map(([name, value, type, note]) => (
        <div key={name} className="rounded-xl border border-line bg-surface p-4">
          <dt className="flex flex-wrap items-center justify-between gap-2">
            <code className="font-mono text-sm font-semibold">{name}</code>
            <span className="tag">{type}</span>
          </dt>
          <dd className="mt-2">
            <input readOnly value={value} aria-label={name} onFocus={(e) => e.currentTarget.select()} className="field font-mono text-xs" />
            <p className="mt-1 text-xs text-muted">{note}</p>
            <button type="button" className="btn-ghost mt-2 px-3 py-1 text-sm" onClick={() => void navigator.clipboard?.writeText(value)}>
              Copy
            </button>
          </dd>
        </div>
      ))}
    </dl>
  );
}
