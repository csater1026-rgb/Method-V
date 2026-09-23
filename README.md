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

**Phase 1 ("Show it") is built:** sign-in by email link, profiles with role tags, posting an app with a 60-second Drop, the Drops feed (New, Trending, Following, by category), the Browse directory with search and filters, app pages with likes and comments, follows, and a "Try it" button that counts real tries. 

**Phase 3 ("Grow"), part 1 is built:** try-to-earn credits and structured feedback. Everyone starts with ⚡10. Builders spend ⚡2 per tester to put an app in the **Test & earn** queue (`/test`); people who open the app with Try it and leave feedback (would you use it, a rating, what worked, what confused you) earn ⚡2, plus ⚡1 when the builder marks it helpful. Feedback is private to the tester and builder; app pages show the totals (testers, % who'd use it, average rating). Balance and history are at `/credits`.

**Phase 3 ("Grow") is built:**

- **Tester Passport:** every app you give feedback on stamps your passport. Ranks (Scout → Tester → Pro Tester → Trusted Tester) come from feedback given and feedback marked helpful, with perks built into the database: Testers earn ⚡3 per paid feedback, Pro Testers can earn from 20 a day, Trusted Testers' feedback shows first to builders. 4 weeks in a row earns a ⚡5 bonus. Profiles show the passport (rank, progress, a stamp per category, streak) and Test & earn shows the month's top testers. Ranks never go down.
- **Launch days:** schedule one free launch day per app (1 hour to 30 days out). It shows under *Launching soon* on Home with a countdown, then sits in the Featured row for 24 hours.
- **Boosts:** spend ⚡10 a day (1, 3 or 7 days) to put an app in the Featured row with a *Boosted* label.
- **Build in public:** a one-box composer ("What did you ship today?") on Home, your profile and your app pages. Home shows updates from you and who you follow.
- **Share kit:** an embeddable *Try it on Method V* badge (`/badge/<app>`, dark or light) with copy-paste HTML/Markdown, plus one-tap posts to X and LinkedIn.
- **Swaps and co-launches:** from another builder's app page, tap *Team up* to swap shoutouts (each app shows the other under *Friends of*, up to 3) or launch on the same day. Requests are answered on `/swaps`.

Builder tools (launch day, boosts, share kit) live in the *Grow* panel on your own app pages; in demo mode everyone sees a preview.

**Phase 2 ("Connect") is built:**

- **Connect with a reason:** on a profile, tap *Connect*, pick why (Collaborate, Hire, Get feedback, Invest, Just a fan) and add an optional note. Connecting back to someone who asked you accepts it. After a decline you can ask again in 30 days.
- **Messages:** once connected, *Message* opens a chat thread (`/inbox/<username>`). Only connected people can message each other, which keeps spam out.
- **Q&A on every app:** ask, answer and upvote; the asker or builder marks the best answer. Each answer upvote is +1 reputation and a best answer +5, shown on profiles. App pages show Comments, Q&A and Updates as tabs.
- **Builders like you:** suggestions on Home from shared categories (what you build, like and test) and skills.
- **Notifications:** one inbox icon in the top bar with an unread count; `/inbox` has Activity (follows, likes, comments, feedback, helpful marks, connections, questions, answers, best answers, swaps), Messages and Requests.

Next: Phase 4 ("Earn"): paid app-to-app sponsorships, stack sponsors, backers and Pro profiles. See the plan.

## Run it locally

You need Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no Supabase keys the site runs in **demo mode**: it shows sample apps and you can click around, but sign-in and posting are off.

## Connect Supabase (to go live)

1. Create a project at [supabase.com](https://supabase.com).
2. In the project's **SQL Editor**, run each file in `supabase/migrations/` in order (oldest first). They create the tables, the security rules, the counters, the credits system and the `drops` storage bucket for videos. (If you use the Supabase CLI, `supabase db push` does the same.)
3. Copy `.env.example` to `.env.local` and fill in the URL and keys from **Project Settings → API**.
4. In **Authentication → URL Configuration**, set the Site URL to your site (for local work, `http://localhost:3000`) and add `http://localhost:3000/auth/callback` (and your live `https://…/auth/callback`) to the redirect URLs.
5. Restart `npm run dev`. Sign in with your email, set your username under **Edit profile**, and post your first Drop.

To deploy, import the repo into [Vercel](https://vercel.com) and add the same environment variables there.

## How it works

| Part | Where |
|---|---|
| Pages: Home feed with Featured and all projects `/`, Drops feed `/drops`, Browse `/browse`, app `/apps/[slug]`, profile `/u/[username]`, Post `/submit`, Edit profile `/settings`, Sign in `/login` | `src/app/` |
| Likes, comments, follows, profile edits, posting | `src/app/actions.ts` (server actions) |
| "Try it" button: records the try, then sends people to the app | `src/app/try/[slug]/route.ts` |
| Test & earn queue `/test`, credits `/credits`, feedback on app pages | `src/app/test/`, `src/app/credits/`, `src/components/FeedbackPanel.tsx` |
| Tester Passport and top testers | `src/components/Passport.tsx` |
| Grow panel (launch day, boosts), share kit, badge | `src/components/GrowPanel.tsx`, `src/components/ShareKit.tsx`, `src/app/badge/[slug]/route.ts` |
| Build-in-public updates | `src/components/Updates.tsx` |
| Swaps and co-launches | `src/components/Swaps.tsx`, `src/app/swaps/` |
| Inbox, notifications, messages, connect | `src/app/inbox/`, `src/components/Inbox.tsx`, `src/components/ConnectButton.tsx` |
| Q&A | `src/components/QandA.tsx` |
| Builders like you | `src/components/Suggestions.tsx` |
| All database reads (plus demo data when Supabase isn't set up) | `src/lib/data.ts`, `src/lib/demo.ts` |
| Link check before an app goes live (blocks private/internal addresses) | `src/lib/link-check.ts` |
| Database tables, security rules, counters, storage bucket | `supabase/migrations/` |

A few rules the code relies on:

- **Drops are 60 seconds or shorter.** The browser reads the video's real length before uploading and the database rejects anything longer. The server doesn't re-measure the file yet; a video service like Mux (in the plan's tech stack) would add that.
- **An app only appears once its link has loaded.** The server checks the link, and only the server (with the secret key) can mark it as checked.
- **Counts can't be faked from the browser.** Likes, comments, followers and tries are kept by database triggers, and people can't write those numbers directly. Each signed-in person counts once per app for tries.
- **Credits only move through the database.** Balances change only through the `credit_events` ledger, which people can't write to; giving feedback, buying testers, refunds and helpful bonuses are handled by database triggers and functions (`request_testers`, `cancel_test_request`, `mark_feedback_helpful`). Feedback requires having opened the app with Try it, can't be on your own app, can't be edited or deleted, and paid feedback is capped at 10 a day.
- **Featured apps** on Home are the ones whose `featured_until` is in the future. Set it by hand in the Supabase table editor (people can't set it on their own apps). With none picked, Home shows the most liked and tried apps from the last 30 days.
- **Connections gate messages.** The database only accepts a message when the two people have an accepted connection. Notifications are written by database triggers (never for your own actions, and not repeated while unread); nobody can create them directly.
- **Videos live in the `drops` bucket** under a folder named after the uploader's user ID, and people can only upload into their own folder.

## Tests

```bash
npm run lint
npx tsc --noEmit
npm run test:db     # security rules against an in-memory Postgres
npm run build && npm start   # then, in another terminal:
npm run test:ui     # clicks through the site in Chromium (demo mode)
```
