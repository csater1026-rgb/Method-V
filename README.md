# Method V

Where builders show off what they've made, get real users, earn money from their apps, and find people to work with.

Method V is for web app designers, software engineers and vibe coders:

- **Drops:** a reels-style feed of app demos, 60 seconds or shorter, each with a "Try it" button
- **Browse:** a directory of web apps you can filter by category, tech stack, pricing and stage
- **People:** profiles with role tags (Founder, Employee, Looking for work, Hiring…) and connecting with a reason
- **Q&A:** questions and answers about each project
- **Reach:** tools that get builders real users and feedback, not just likes
- **Earn:** sponsorships, backers and bounties that back the app itself, including the Boost Exchange, where apps sponsor and promote each other

See [PLAN.md](PLAN.md) for the full product plan and build phases.

## Status

**Phase 1 ("Show it") is built:** sign-in by email link, profiles with role tags, posting an app with a 60-second Drop, the Drops feed (New, Trending, Following, by category), the Browse directory with search and filters, app pages with likes and comments, follows, and a "Try it" button that counts real tries. Phases 2–5 are next (see the plan).

## Run it locally

You need Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no Supabase keys the site runs in **demo mode**: it shows sample apps and you can click around, but sign-in and posting are off.

## Connect Supabase (to go live)

1. Create a project at [supabase.com](https://supabase.com).
2. In the project's **SQL Editor**, run everything in `supabase/migrations/20260923000000_phase1.sql`. It creates the tables, the security rules, the counters and the `drops` storage bucket for videos. (If you use the Supabase CLI, `supabase db push` does the same.)
3. Copy `.env.example` to `.env.local` and fill in the URL and keys from **Project Settings → API**.
4. In **Authentication → URL Configuration**, set the Site URL to your site (for local work, `http://localhost:3000`) and add `http://localhost:3000/auth/callback` (and your live `https://…/auth/callback`) to the redirect URLs.
5. Restart `npm run dev`. Sign in with your email, set your username under **Edit profile**, and post your first Drop.

To deploy, import the repo into [Vercel](https://vercel.com) and add the same environment variables there.

## How it works

| Part | Where |
|---|---|
| Pages: Drops feed `/`, Browse `/browse`, app `/apps/[slug]`, profile `/u/[username]`, Post `/submit`, Edit profile `/settings`, Sign in `/login` | `src/app/` |
| Likes, comments, follows, profile edits, posting | `src/app/actions.ts` (server actions) |
| "Try it" button: records the try, then sends people to the app | `src/app/try/[slug]/route.ts` |
| All database reads (plus demo data when Supabase isn't set up) | `src/lib/data.ts`, `src/lib/demo.ts` |
| Link check before an app goes live (blocks private/internal addresses) | `src/lib/link-check.ts` |
| Database tables, security rules, counters, storage bucket | `supabase/migrations/` |

A few rules the code relies on:

- **Drops are 60 seconds or shorter.** The browser reads the video's real length before uploading and the database rejects anything longer. The server doesn't re-measure the file yet; a video service like Mux (in the plan's tech stack) would add that.
- **An app only appears once its link has loaded.** The server checks the link, and only the server (with the secret key) can mark it as checked.
- **Counts can't be faked from the browser.** Likes, comments, followers and tries are kept by database triggers, and people can't write those numbers directly. Each signed-in person counts once per app for tries.
- **Videos live in the `drops` bucket** under a folder named after the uploader's user ID, and people can only upload into their own folder.

## Tests

```bash
npm run lint
npx tsc --noEmit
npm run test:db     # security rules against an in-memory Postgres
npm run build && npm start   # then, in another terminal:
npm run test:ui     # clicks through the site in Chromium (demo mode)
```
