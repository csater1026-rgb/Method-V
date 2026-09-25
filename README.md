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

**Phase 1 ("Show it") is built:** sign-in by email link, profiles with role tags, posting an app with a 60-second Drop, the Drops feed (For you, which learns what each person is into from what they watch, like, try and skip; Trending; Following), the Browse directory with search and filters, app pages with likes and comments, follows, and a "Try it" button that counts real tries. 

**Phase 3 ("Grow"), part 1 is built:** try-to-earn credits and structured feedback. Everyone starts with ⚡10. Builders spend ⚡2 per tester to put an app in the **Test & earn** queue (`/test`, linked from Browse; each app page explains Test & earn right under its description); people who open the app with Try it and leave feedback (would you use it, a rating, what worked, what confused you) earn ⚡2, plus ⚡1 when the builder marks it helpful. Feedback is private to the tester and builder; app pages show the totals (testers, % who'd use it, average rating). Balance and history are at `/credits`.

**Phase 3 ("Grow") is built:**

- **Tester Passport:** every app you give feedback on stamps your passport. Ranks (Scout → Tester → Pro Tester → Trusted Tester) come from feedback given and feedback marked helpful, with perks built into the database: Testers earn ⚡3 per paid feedback, Pro Testers can earn from 20 a day, Trusted Testers' feedback shows first to builders. 4 weeks in a row earns a ⚡5 bonus. Profiles show the passport (rank, progress, a stamp per category, streak) and Home (and the Test & earn queue) show the month's top testers. Ranks never go down.
- **Launch days:** schedule one free launch day per app (1 hour to 30 days out). It shows under *Launching soon* on Browse with a countdown, then sits in the Featured row for 24 hours.
- **Boosts:** spend ⚡10 a day (1, 3 or 7 days) to put an app in the Featured row with a *Boosted* label.
- **Build in public:** a one-box composer ("What did you ship today?") on Home, your profile and your app pages. Home shows updates from you and who you follow.
- **Share kit:** an embeddable *Try it on Method V* badge (`/badge/<app>`, dark or light) with copy-paste HTML/Markdown, plus one-tap posts to X and LinkedIn.
- **Swaps and co-launches:** from another builder's app page, tap *Team up* to swap shoutouts (each app shows the other under *Friends of*, up to 3) or launch on the same day. Requests are answered on `/swaps`.

Builder tools (launch day, the Spotlight, share kit) live in the *Grow* panel on your own app pages; in demo mode everyone sees a preview.

**Phase 2 ("Connect") is built:**

- **Connect with a reason:** on a profile, tap *Connect*, pick why (Collaborate, Hire, Get feedback, Invest, Just a fan) and add an optional note. Connecting back to someone who asked you accepts it. After a decline you can ask again in 30 days.
- **Messages:** once connected, *Message* opens a chat thread (`/inbox/<username>`). Only connected people can message each other, which keeps spam out.
- **Q&A on every app:** ask, answer and upvote; the asker or builder marks the best answer. Each answer upvote is +1 reputation and a best answer +5, shown on profiles. App pages show Comments, Q&A and Updates as tabs.
- **Builders like you:** suggestions on Home from shared categories (what you build, like and test) and skills.
- **Notifications:** one inbox icon in the top bar with an unread count; `/inbox` has Activity (follows, likes, comments, feedback, helpful marks, connections, questions, answers, best answers, swaps), Messages and Requests.

**Easy posting:**

- **Two steps:** pick your video, paste your link. Method V reads your site to fill in the name, tagline and description and guesses the category; everything else (pricing, stage, built with, caption) is under *More details*. It tells you what's still missing.
- **The + button** on phones opens the camera or video library straight away, then the Post screen opens with that video ready (like TikTok).
- **Sign in only when needed:** browse and watch without an account. Liking, following, connecting, voting or posting while signed out opens a sign-in sheet over the page and brings you back to the same spot. Optional *Continue with GitHub / Google* buttons (see step 4b under "Connect Supabase").

**Phase 4 ("Earn") is built:**

- **Status, not a jobs board:** there's no jobs board. Everyone picks a status in their profile (Hiring, Looking for work, Open to collab, Freelancer), shown as a badge next to their photo on their profile, their Drops and their app pages. To hire or get hired you Connect with a reason and then message privately. Old `/jobs` links go to Browse; the jobs tables stay in the database, unused.
- **Questions (Q&A):** Drops has a **Questions** tab: one question per screen, swipe for the next, ranked for you (fresh and unanswered first, builders asking about their own app, polls, your categories). Questions can carry a one-tap poll (2–4 choices; totals are public, who picked what isn't). Each opens a Reddit-style thread at `/q/<id>` with upvotes, one level of replies and a best answer (+5 reputation). Ask from an app's Q&A, from `/ask`, or from the link on the Post page. Needs `supabase/migrations/20261003000000_questions_feed.sql` and `20261004000000_qa_fixes.sql` (replies outlive a deleted answer and notify the person replied to; polls reject blank or nested choices; the builders board counts signed-in tries only).
- **Top builders:** Home shows this month's top builders (tries on their apps + 2× likes on their Drops, from other people) above the top testers.
- **Social handles:** website, X, GitHub, LinkedIn, Instagram, TikTok, YouTube and Threads, shown right under the builder's name (on the site and in the app). Type a handle or paste a profile link in Edit profile. Instagram, TikTok, YouTube and Threads need `supabase/migrations/20261002000000_socials.sql`.
- **Notifications (optional):** Edit profile and the app's Me tab have three switches (new followers; feedback on your apps: tester feedback, comments and questions; messages: direct messages and connection requests) and a button to turn notifications on for that browser or phone. Database triggers queue a push only for people who want that kind and have a device on; a Supabase webhook calls `/api/push/send`, which sends through Expo (phones) and Web Push (browsers). See step 7.
- **Profile photos:** upload one under Edit profile. It's cropped to a square and shrunk in the browser, stored in your own folder of the `drops` bucket, and shown everywhere your avatar appears (letters until then). Needs `supabase/migrations/20261001000000_avatars.sql`.
- **Backers:** *Back it* on any app sends the builder a one-off tip ($1–$500) through Stripe Checkout. The builder gets 95%. The app page has a backers wall with names and notes, never amounts, and backers can choose to stay off it.
- **Sponsorship packages:** builders choose which packages their app offers and set their own price for each ($10–$1,000): a Sponsored card on their app page and Drops for 7 days, a shout-out in a Drop, an ad on their website for 30 days, a video on their socials, or a newsletter mention. A sponsor (with one of their live apps or verified brands) picks one on the app's page, writes a brief and pays; Method V holds the money. The builder has 3 days to accept or decline (declined or no answer is a full refund), then delivers with a link as proof (the card goes up by itself). The sponsor approves, or it's approved by itself 3 days later, and the builder is paid less 12% (7% with Pro); not delivered within 14 days is a full refund. Sponsors can **Report a problem**, which holds the money until you settle it in the SQL Editor with `select public.resolve_package_dispute('<deal id>', true)` (true refunds the sponsor, false pays the builder). Sponsors can run 3 at once, 10 with Pro. Deals live on `/earn`. (The older pay-per-try offers are switched off; any already running finish.)
- **Challenges (`/challenges`):** sponsored prizes like "Best app built on Supabase". Builders enter their own apps (up to 3; the app must use the required stack or category). Everyone gets one vote per challenge, and new accounts can vote after their first day. The Method V team creates challenges and picks winners (see below).
- **Earn (`/earn`):** your balance from tips and sponsored tries, *Set up payouts* (Stripe Connect Express) and *Cash out* from $5, your sponsorship deals, and history.
- **Pro (`/pro`):** $6 for 30 days, not a subscription. You get tries per day for the last 30 days (including how many came from sponsor cards), a pinned app on your profile, the Spotlight for ⚡15 instead of ⚡25, and a Pro badge.

**Phase 5 ("Scale") is built:**

- **Get the app (`/app`):** Method V installs to the home screen on iPhone (Safari → Share → Add to Home Screen) and Android/desktop Chrome (Install). It opens full screen with the tab bar and shows a friendly page when offline. Native App Store and Google Play apps come later.
- **Stats (`/dashboard`):** for each of your apps: tries, likes, feedback and sponsored tries per day, and where tries come from (Drops feed, app page, embeds, cards, sponsor cards, shared links, API, direct). The last 7 days are free; 30 and 90 days and CSV export come with Pro.
- **Public API (`/api/v1`) and embeds:** read-only JSON for apps, builders and challenges, open to any site. There's an embeddable app card (`/embed/<app>`, an iframe with a Try it button) and the badge. Builders get the embed snippet in their Share kit, and the docs are at `/developers`.
- **Brand sponsors (`/brands`):** companies outside Method V list a brand (its site is link-checked). Once the Method V team verifies it, the brand can make pay-per-try offers on any app, with the same rules and labels as app-to-app deals. To verify a brand, set `verified_at` on its row in the `brands` table.

**Native app (in progress):** the iPhone and Android app lives in [`mobile/`](mobile/README.md) and is built with Expo. It has Home, the Drops feed, posting with the camera, Browse, app pages, profiles and sign-in. Store builds run on EAS, so no Mac is needed. See `mobile/README.md` to run it or ship it.

**Members only:** on the live site, signed-out visitors land on the welcome page (`/login`: log in or create an account, then a short "What's on Method V"), and go back to the page they wanted after signing in. Sign-in, webhooks, APIs, embeds, badges, Try-it links, icons and setup pages stay open; the list is in `src/lib/gate.ts`. Demo mode (no Supabase keys) has no wall.

**First-time tour:** the first time someone signs in, the website walks them through Home (Featured, Drops, Post, Browse, credits, inbox, profile) with each part highlighted, and the app does the same across its tabs. Skip any time; remembered per account on each device. Replay from Edit profile (website, `/?tour=1`) or the Me tab (app). The phone app also shows only sign-in until you're signed in.

**Sign in, on the website and in the app:** email and password (sign in or create an account), Google and Apple (plus GitHub on the website), or an emailed link or code. The emailed option is also "forgot password", and you can set a new password under Edit profile. It's one account everywhere.

Payments are off until Stripe is connected (step 6 below). Until then offers and challenges still work, and anything that takes money says payments aren't switched on.

## Run it locally

You need Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no Supabase keys the site runs in **demo mode**: it shows sample apps and you can click around, but sign-in and posting are off.

## Connect Supabase (to go live)

1. Create a project at [supabase.com](https://supabase.com).
2. In the project's **SQL Editor**, open a new query, paste all of `supabase/setup.sql` and press **Run**. That one file creates every table, security rule, counter and function, plus the `drops` storage bucket for videos. (It's all of `supabase/migrations/` joined together. For a project that's already set up, run just the newer migration files instead. The Supabase CLI's `supabase db push` also works.)
3. Copy `.env.example` to `.env.local` and fill in the URL and keys from **Project Settings → API**.
4. In **Authentication → URL Configuration**, set the Site URL to your site (for local work, `http://localhost:3000`) and add `http://localhost:3000/auth/callback` (and your live `https://…/auth/callback`) to the redirect URLs.
4b. Optional, for one-tap sign-in: turn on Google, Apple and/or GitHub under **Authentication → Providers**, then list them in `NEXT_PUBLIC_AUTH_PROVIDERS`, e.g. `google,apple`. Email + password needs no setup (it's on by default in Supabase).
5. Restart `npm run dev`. Sign in with your email, set your username under **Edit profile**, and post your first Drop.
6. Optional, for tips, sponsorships, Pro and payouts: in [Stripe](https://dashboard.stripe.com), turn on **Connect** (Express accounts). Add a webhook endpoint at `https://<your site>/api/stripe/webhook` that listens to `checkout.session.completed` and `checkout.session.async_payment_succeeded`, and also to `account.updated` from **connected accounts**. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (the endpoint's signing secret). `SUPABASE_SECRET_KEY` must be set too. Payments stay off unless all three are set. To test locally, use Stripe's test keys and `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
7. Optional, push notifications (people turn them on themselves, and pick followers, feedback and messages): run `supabase/migrations/20261005000000_push.sql`. Open `https://<your site>/setup/push-keys`; it makes three values in your browser. In Vercel add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Config), `VAPID_PRIVATE_KEY` (Secret) and `PUSH_WEBHOOK_SECRET` (Secret), then redeploy. In Supabase, **Database → Webhooks → Create a new hook**: table `push_queue`, event **Insert**, type **HTTP Request**, method **POST**, URL `https://<your site>/api/push/send`, and an HTTP header `x-push-secret` set to the same `PUSH_WEBHOOK_SECRET`. For the phone app, the EAS build needs push credentials: iOS is set up by `eas build` (let it create a push key), Android needs an FCM key (`eas credentials`, see Expo's push notification setup). If you turn on Expo's enhanced push security, also set `EXPO_ACCESS_TOKEN`. `/api/health` shows what's on.
8. Run `supabase/migrations/20261006000000_reserved_handle.sql` once the Method V account is `@methodv`. It reserves that handle (drawn with the logo's pixel V) so nobody else can take it.
9. Run `supabase/migrations/20261007000000_spotlight.sql`: the **Spotlight** replaces Boost (4 spots in the Featured row, 3 days each, ⚡25 or ⚡15 with Pro, first come first served with a line when they're all taken), and people can **buy credits** on `/credits` (25 for $5, 60 for $10, 150 for $20; needs the Stripe keys from the Earn setup). Credits can't be turned back into money, and they're sold on the website only.
10. Run `supabase/migrations/20261008000000_sponsor_packages.sql` for sponsorship packages. Run the migration files in order, oldest first; each is safe to run twice.

To run a challenge, add a row to the `challenges` table in the Supabase table editor: `slug`, `title`, `sponsor_name`, `prize`, `ends_at`, and optionally `body`, `sponsor_url`, `stack`, `category`, `starts_at`. To pick a winner, set `winner_entry_id` to the winning row in `challenge_entries`. Prizes are paid by the sponsor, outside Method V.

To deploy, import the repo into [Vercel](https://vercel.com) and add the same environment variables there. After it deploys, open `https://<your site>/api/health`. It says whether the keys, database and secret key are working, and what to fix if not (it never shows the keys themselves).

**Video size on Supabase's free plan:** uploads are capped at 50 MB per file (Storage → Settings), while Method V allows Drops up to 100 MB. On the free plan, bigger videos fail to upload. Either keep Drops under 50 MB, or move to Supabase Pro and raise the limit to 100 MB.

**Sign-in emails:** Supabase's built-in email is only for testing (a few emails an hour). Before real people sign up, add your own email sender under Authentication → Emails → SMTP Settings (e.g. Resend, Postmark or SendGrid). To make the emails look like Method V, open `https://<your site>/setup/emails` and copy each subject and message into **Authentication → Emails → Templates** (they keep the 6-digit code the phone app asks for).

## How it works

| Part | Where |
|---|---|
| Pages: Home feed with Featured and all projects `/`, Drops feed `/drops`, Browse `/browse`, app `/apps/[slug]`, profile `/u/[username]`, Post `/submit`, Edit profile `/settings`, Sign in `/login` | `src/app/` |
| Likes, comments, follows, profile edits, posting | `src/app/actions.ts` (server actions) |
| "Try it" button: records the try, then sends people to the app | `src/app/try/[slug]/route.ts` |
| Test & earn queue `/test`, credits `/credits`, feedback on app pages | `src/app/test/`, `src/app/credits/`, `src/components/FeedbackPanel.tsx` |
| Tester Passport and top testers | `src/components/Passport.tsx` |
| Grow panel (launch day, the Spotlight), share kit, badge | `src/components/GrowPanel.tsx`, `src/components/ShareKit.tsx`, `src/app/badge/[slug]/route.ts` |
| Build-in-public updates | `src/components/Updates.tsx` |
| Swaps and co-launches | `src/components/Swaps.tsx`, `src/app/swaps/` |
| Inbox, notifications, messages, connect | `src/app/inbox/`, `src/components/Inbox.tsx`, `src/components/ConnectButton.tsx` |
| Q&A | `src/components/QandA.tsx` |
| Builders like you | `src/components/Suggestions.tsx` |
| All database reads (plus demo data when Supabase isn't set up) | `src/lib/data.ts`, `src/lib/demo.ts` |
| Link check before an app goes live (blocks private/internal addresses) | `src/lib/link-check.ts` |
| Back it, sponsor offers, deal rows, payouts, Pro buttons | `src/components/Earn.tsx`, `src/components/Sponsored.tsx`, `src/components/Backers.tsx` |
| Earn `/earn`, Pro `/pro`, Challenges `/challenges` | `src/app/earn/`, `src/app/pro/`, `src/app/challenges/`, `src/components/Challenges.tsx` |
| Stats dashboard and CSV export | `src/app/dashboard/`, `src/lib/dashboard.ts`, `src/components/StatsChart.tsx` |
| Public API, embed card, developer docs | `src/app/api/v1/`, `src/lib/api.ts`, `src/app/embed/[slug]/route.ts`, `src/app/developers/` |
| Installable app: manifest, icons, service worker, install page | `src/app/manifest.ts`, `src/app/app-icon/`, `src/app/apple-icon.tsx`, `public/sw.js`, `src/components/InstallApp.tsx`, `src/app/app/` |
| Mobile app (Expo) and the endpoints it posts through | `mobile/`, `src/app/api/mobile/`, `src/lib/publish.ts`, `src/lib/supabase/bearer.ts` |
| Brands and brand links | `src/app/brands/`, `src/components/Brands.tsx`, `src/app/go/[slug]/route.ts` |
| Stripe (REST, no SDK), webhook, refunds | `src/lib/stripe.ts`, `src/lib/stripe-core.ts`, `src/lib/payments.ts`, `src/app/api/stripe/webhook/route.ts` |
| Database tables, security rules, counters, storage bucket | `supabase/migrations/` |

A few rules the code relies on:

- **Drops are 60 seconds or shorter.** The browser reads the video's real length before uploading and the database rejects anything longer. The server doesn't re-measure the file yet; a video service like Mux (in the plan's tech stack) would add that.
- **An app only appears once its link has loaded.** The server checks the link, and only the server (with the secret key) can mark it as checked.
- **Counts can't be faked from the browser.** Likes, comments, followers and tries are kept by database triggers, and people can't write those numbers directly. Each signed-in person counts once per app for tries.
- **Credits only move through the database.** Balances change only through the `credit_events` ledger, which people can't write to; giving feedback, buying testers, refunds and helpful bonuses are handled by database triggers and functions (`request_testers`, `cancel_test_request`, `mark_feedback_helpful`). Feedback requires having opened the app with Try it, can't be on your own app, can't be edited or deleted, and paid feedback is capped at 10 a day.
- **Featured apps** on Home are the ones whose `featured_until` is in the future. Set it by hand in the Supabase table editor (people can't set it on their own apps). With none picked, Home shows the most liked and tried apps from the last 30 days.
- **Connections gate messages.** The database only accepts a message when the two people have an accepted connection. Notifications are written by database triggers (never for your own actions, and not repeated while unread); nobody can create them directly.
- **Money only moves through the server and Stripe.** The site creates a pending payment with `prepare_payment()` as the payer, so every rule applies. Only the signed Stripe webhook, using the secret key, can complete it (`complete_payment()`, safe to repeat). Nobody can write payments, earnings, payouts, backings or sponsorship totals from the browser. Cash-outs move the whole balance into a pending payout before the Stripe transfer and put it back if the transfer fails. Unspent sponsorship budget is marked for refund in the database and refunded through Stripe. A failed refund is retried the next time the sponsor opens `/earn`.
- **Only the embed card can be framed.** Every other page sends `X-Frame-Options: DENY` (see `next.config.ts`). The embed runs no scripts and loads nothing but the Drop's poster.
- **The API is read-only and public.** It only returns what's already public on the site, and the CDN caches each answer for a minute. Links in it go through `/try/<app>?via=api`, so tries are counted.
- **Sponsored is always labeled.** Sponsor cards always say Sponsored, and each app shows one sponsor at a time. A sponsored try only counts when it lands on the sponsor's own app.
- **Videos live in the `drops` bucket** under a folder named after the uploader's user ID, and people can only upload into their own folder.

## Tests

```bash
npm run lint
npx tsc --noEmit
npm run test:unit   # site preview parsing, category guesses, link safety, Stripe signatures
npm run test:db     # security rules against an in-memory Postgres
npm run build && npm start   # then, in another terminal:
npm run test:ui     # clicks through the site in Chromium (demo mode)
```
