import type { Metadata } from "next";

export const metadata: Metadata = { title: "Developers" };

const ENDPOINTS = [
  { path: "/api/v1/apps", about: "Live apps, newest first.", params: "q, category, stack, pricing, stage, sort=latest|tried, limit (1–50)" },
  { path: "/api/v1/apps/{slug}", about: "One app, with its latest Drop and stats.", params: "" },
  { path: "/api/v1/users/{username}", about: "A builder's public profile and their apps.", params: "" },
  { path: "/api/v1/jobs", about: "Open posts on the jobs board.", params: "kind=hiring|gig|looking, skill" },
  { path: "/api/v1/challenges", about: "Sponsored challenges.", params: "" },
];

const SAMPLE = `{
  "app": {
    "slug": "noteflow",
    "name": "NoteFlow",
    "tagline": "Meeting notes that turn into to-dos on their own",
    "category": "productivity",
    "tech_stack": ["Next.js", "Supabase", "Claude"],
    "page_url": "https://…/apps/noteflow",
    "try_url": "https://…/try/noteflow?via=api",
    "embed_url": "https://…/embed/noteflow",
    "stats": { "tries": 412, "likes": 96, "backers": 12, "testers": 18,
               "would_use_percent": 78, "rating": 4.4 },
    "builder": { "username": "ada_builds", "display_name": "Ada Park", "url": "https://…/u/ada_builds" }
  }
}`;

export default function DevelopersPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="eyebrow">API · embeds · badges</p>
      <h1 className="display rise mt-1 text-6xl">Developers</h1>
      <p className="mt-1 text-muted">
        Put Method V apps on your own site: a read-only JSON API, an embeddable app card and a badge. All free, no key
        needed.
      </p>

      <section aria-label="API" className="mt-10">
        <h2 className="display text-4xl">API</h2>
        <p className="mt-1 text-sm text-muted">
          <code className="font-mono text-ink">GET</code> requests, JSON back, open to any website (CORS). Answers are
          cached for about a minute. Only public information is included, never feedback, earnings or messages.
        </p>
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface">
          {ENDPOINTS.map((e) => (
            <li key={e.path} className="px-4 py-3 text-sm">
              <code className="font-mono font-semibold text-accent">{e.path}</code>
              <p className="mt-0.5">{e.about}</p>
              {e.params && <p className="mt-0.5 font-mono text-xs text-muted">{e.params}</p>}
            </li>
          ))}
        </ul>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface p-4 font-mono text-xs leading-relaxed">{SAMPLE}</pre>
        <p className="mt-3 text-sm text-muted">
          Link people to <code className="font-mono text-ink">try_url</code> rather than the app&apos;s own site: it counts
          the try for the builder, and they can see how many came from the API.
        </p>
      </section>

      <section aria-label="Embeds" className="mt-10">
        <h2 className="display text-4xl">Embed an app</h2>
        <p className="mt-1 text-sm text-muted">
          A small card with a Try it button. Add <code className="font-mono text-ink">?theme=light</code> for the light version.
          Builders find a ready-made snippet in the Share kit on their app page.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface p-4 font-mono text-xs">
          {`<iframe src="https://…/embed/noteflow" title="NoteFlow on Method V"
        width="420" height="160" style="border:0;max-width:100%" loading="lazy"></iframe>`}
        </pre>
        <div className="mt-4 max-w-[420px]">
          <iframe src="/embed/noteflow" title="NoteFlow on Method V (example)" width={420} height={160} className="w-full border-0" loading="lazy" />
        </div>
      </section>

      <section aria-label="Badges" className="mt-10">
        <h2 className="display text-4xl">Badge</h2>
        <p className="mt-1 text-sm text-muted">
          <code className="font-mono text-ink">/badge/{"{slug}"}</code> is an SVG “Try it on Method V” badge with a live try
          count, for READMEs and footers.
        </p>
      </section>
    </div>
  );
}
