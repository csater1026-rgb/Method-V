import type { Metadata } from "next";

import { InstallButton } from "@/components/InstallApp";
import { PixelCoder } from "@/components/PixelCoder";

export const metadata: Metadata = { title: "Get the app" };

const STEPS = [
  {
    title: "iPhone and iPad",
    steps: ["Open Method V in Safari.", "Tap the Share button (the square with an arrow).", "Tap “Add to Home Screen”, then “Add”."],
  },
  {
    title: "Android",
    steps: ["Open Method V in Chrome.", "Tap “Install” above, or open the ⋮ menu.", "Tap “Install app” (or “Add to Home screen”)."],
  },
  {
    title: "Computer",
    steps: ["Open Method V in Chrome or Edge.", "Click the install icon at the right of the address bar.", "Method V opens in its own window."],
  },
];

export default function GetTheAppPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <PixelCoder size={110} title="The Method V pixel coder" />
        <div>
          <p className="font-mono text-[11px] tracking-widest text-accent uppercase">iPhone · Android · desktop</p>
          <h1 className="display rise mt-1 text-6xl">Get the app</h1>
          <p className="mt-1 text-muted">
            Put Method V on your home screen. It opens full screen with the tab bar, like any other app, and there&apos;s
            nothing to download from a store.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <InstallButton />
      </div>

      <ol className="mt-8 grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rise rounded-xl border border-line bg-surface p-4" style={{ "--i": i } as React.CSSProperties}>
            <h2 className="display text-3xl">{s.title}</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink/90">
              {s.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </li>
        ))}
      </ol>

      <p className="mt-8 text-sm text-muted">App Store and Google Play versions are on the way.</p>
    </div>
  );
}
