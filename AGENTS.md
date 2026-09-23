<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Method V

Read `PLAN.md` for the product plan and `README.md` for setup and how the code is laid out.

- Next.js 16 App Router + Supabase. `src/proxy.ts` is the old "middleware" (renamed in Next 16). `params`, `searchParams` and `cookies()` are async.
- With no Supabase keys the site runs in demo mode using `src/lib/demo.ts`. Every read in `src/lib/data.ts` and every action in `src/app/actions.ts` must keep working (or explain itself) in demo mode.
- The database is the source of truth for rules: lists of categories, roles, pricing and stages live in both `src/lib/constants.ts` and the check constraints in `supabase/migrations/` — change both together. Add a new migration file rather than editing an applied one.
- Writes from the browser are limited by column grants and row level security. Counters (likes, comments, tries, followers) are trigger-only. `link_checked_at` is only set by the server with the secret key, after `checkLink()` passes.
- Credits: balances change only via rows in `credit_events` (trigger-applied, never negative). The credit amounts live in both `CREDITS` in `src/lib/constants.ts` and the Phase 3 migration — change both together. Feedback is private to tester and builder; only totals on `apps` are public.
- `src/lib/link-check.ts` makes server-side requests to user-supplied URLs; keep its private-address blocking and per-connection DNS check intact.
- "Try it" buttons are plain `<a href="/try/<slug>">`, not `next/link`, so prefetching never counts as a try.
- Before committing: `npm run lint`, `npx tsc --noEmit`, `npm run test:db`, and `npm run test:ui` against a running build.
- Design: "drop culture meets the late-night code editor", mobile-app first. Tokens live in `@theme` in `src/app/globals.css` (warm carbon, paper ink, one safety-orange accent); use them, not raw colors. Fonts: `display` utility (Big Shoulders, uppercase) for headlines, Schibsted Grotesk for text, Martian Mono (`font-mono`, `tag`) for numbers, timers, credits and labels. Motion is limited to the `rise` entrance (set `--i` for stagger), the feed caption reveal and the like pop, and is switched off under `prefers-reduced-motion`. Phones get the bottom tab bar (`MobileTabs`, height `--tabbar`); keep tap targets ≥ 40px.
