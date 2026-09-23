"use client";

import { useState, useSyncExternalStore } from "react";

type Props = { slug: string; name: string; tagline: string };

const noSubscribe = () => () => {};

// Share kit in the builder's Grow panel: an embeddable badge with copy-paste
// code, and one-tap posts to X and LinkedIn.
export function ShareKit({ slug, name, tagline }: Props) {
  // The site's own address, known only in the browser.
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [copied, setCopied] = useState<string | null>(null);

  const page = `${origin}/apps/${slug}`;
  const badge = `${origin}/badge/${slug}${theme === "light" ? "?theme=light" : ""}`;
  const embed = `${origin}/embed/${slug}${theme === "light" ? "?theme=light" : ""}`;
  const snippets = {
    HTML: `<a href="${page}"><img src="${badge}" alt="Try ${name} on Method V" width="232" height="54"></a>`,
    Markdown: `[![Try ${name} on Method V](${badge})](${page})`,
    "embed card": `<iframe src="${embed}" title="${name.replace(/"/g, "&quot;")} on Method V" width="420" height="160" style="border:0;max-width:100%" loading="lazy"></iframe>`,
  };
  const post = `${name}: ${tagline}. Try it on Method V`;

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      window.prompt("Copy this", text);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-line bg-bg/50 p-4">
      <h3 className="display text-2xl">Share kit</h3>
      <p className="mt-1 text-sm text-muted">
        Put the badge on your site or GitHub README, or embed a card with a Try it button. Tries from embeds show up in
        your stats.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- live SVG badge */}
        <img src={`/badge/${slug}${theme === "light" ? "?theme=light" : ""}`} alt={`Try ${name} on Method V`} width={232} height={54} />
        <div className="flex gap-1" role="radiogroup" aria-label="Badge style">
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={theme === t}
              onClick={() => setTheme(t)}
              className={`rounded-md border px-2.5 py-1 font-mono text-[11px] uppercase ${
                theme === t ? "border-accent bg-accent text-accent-ink" : "border-line text-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(snippets).map(([label, text]) => (
          <button key={label} type="button" className="btn-ghost" onClick={() => copy(label, text)}>
            {copied === label ? "Copied!" : `Copy ${label}`}
          </button>
        ))}
        <button type="button" className="btn-ghost" onClick={() => copy("link", page)}>
          {copied === "link" ? "Copied!" : "Copy link"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          className="btn-accent"
          target="_blank"
          rel="noopener noreferrer"
          href={`https://x.com/intent/post?text=${encodeURIComponent(post)}&url=${encodeURIComponent(page)}`}
        >
          Post on X
        </a>
        <a
          className="btn-accent"
          target="_blank"
          rel="noopener noreferrer"
          href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(page)}`}
        >
          Share on LinkedIn
        </a>
      </div>
    </div>
  );
}
