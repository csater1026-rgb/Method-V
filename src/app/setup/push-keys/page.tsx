import type { Metadata } from "next";

import { PushKeys } from "./PushKeys";

export const metadata: Metadata = { title: "Push notification keys", robots: { index: false } };

// For whoever runs the site: makes the keys push notifications need, right
// in this browser. Nothing is sent anywhere; every visit makes a new set.
export default function PushKeysPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <p className="eyebrow">Site setup</p>
      <h1 className="display rise text-5xl">Push notification keys</h1>
      <p className="mt-2 text-muted">
        Made right here in your browser; nothing is sent anywhere. Copy each value into Vercel → Settings → Environment
        Variables, then redeploy. The webhook secret also goes into the Supabase webhook (see the README).
      </p>
      <PushKeys />
    </div>
  );
}
