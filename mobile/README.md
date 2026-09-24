# Method V for iPhone and Android

The native Method V app, built with [Expo](https://expo.dev) (React Native). It uses the same Supabase project as the website, with the same accounts, data and security rules.

## What's in it

- **Home:** Featured, Builders like you (follow suggestions), Just posted, then this month's **Top builders** and **Top testers**, like the website.
- **Drops:** a full-screen, swipeable feed of 60-second demos. The one on screen plays (tap for sound), with like, share and Try it. Sponsored Drops are labeled. Ordered "For you", the same ranking as the website: it learns what each person is into from what they watch, like, open, try and skip (kept on the device), plus their likes, comments, feedback and follows when signed in. A **Drops | Questions** switch at the top opens the Questions feed (same ranking as the website): one question per screen, one-tap polls, and a thread screen with answers, replies, upvotes (on questions and answers, not your own) and the best answer. **Ask a question** (about one of your apps, or the app you came from, with an optional 2–4 choice poll) from the Ask button in Questions, the Questions section on every app page, or the link on the Post tab.
- **Post (+):** record a Drop with the camera or pick a video (60 seconds max), then paste your link. The app reads your site to fill in the name, tagline and category, then uploads with a progress screen.
- **Browse:** search and categories.
- **App pages:** the Drop, Try it, likes, stats, sponsor card, builder and comments.
- **Profiles:** role tags, Pro badge, follow, and the builder's apps.
- **Sign in:** email and password (sign in or create an account), Continue with Google, Continue with Apple (iPhone), or an emailed 6-digit code, which is also the "forgot password" path. You can set a new password on the Me tab.
- **Me:** your account. Add, change or remove your profile photo (cropped square and shrunk on the phone before it uploads) and pick your status (Hiring, Looking for work, Open to collab, Freelancer…), which shows as a badge by your photo on your profile, your Drops and your app pages, like on the website. Stats, Earn, Credits, Inbox and the rest of Edit profile open on the website for now.

It uses the website's category lists, types and sample data directly (`../src/lib`, imported as `@shared/…`), so they can't drift apart. With no Supabase keys it runs in **demo mode** with that sample data.

## Run it

You need Node.js 20+ and the **Expo Go** app on your phone.

```bash
cd mobile
npm install
cp .env.example .env      # fill in, or leave empty for demo mode
npx expo start            # scan the QR code with Expo Go (Android) or the Camera app (iPhone)
```

## Connect it to your Method V project

1. **Keys.** In `mobile/.env`, set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the same public values as the website), and `EXPO_PUBLIC_SITE_URL` (your live website; posting goes through it because the website runs the link check). Only public keys go here: `EXPO_PUBLIC_` values are built into the app.
2. **Database.** Run the latest migration (`supabase/migrations/20260930000000_mobile.sql`) like the others. It lets tries from the app count as "Mobile app" in Stats.
3. **Email code.** In Supabase → Authentication → Email Templates, make sure the **Magic Link** and **Confirm signup** templates include the code, `{{ .Token }}`, next to or instead of the link. The app asks people to type that code.
4. **Passwords.** Email + password is on by default in Supabase (Authentication → Providers → Email). Under Authentication → Policies you can require stronger passwords; the app and website ask for at least 8 characters.
5. **Google (optional).** Turn on Google under Authentication → Providers (it needs a Google Cloud OAuth client). Add `methodv://auth/callback` to Authentication → URL Configuration → Redirect URLs. Then set `EXPO_PUBLIC_AUTH_PROVIDERS=google`. While testing in Expo Go, also add the `exp://…/--/auth/callback` address Expo prints.
6. **Apple (optional, iPhone).** Turn on Apple under Authentication → Providers and add the app's bundle ID (`com.methodv.app`, or your own) as a client ID. Then add `apple` to `EXPO_PUBLIC_AUTH_PROVIDERS`. **Apple requires Sign in with Apple in any iPhone app that offers Google sign-in**, so turn both on together.

## Put it in the App Store and Google Play

Builds run in the cloud on [EAS](https://expo.dev/eas), so you don't need a Mac.

1. Create a free Expo account, then run `npx eas-cli@latest login` and `npx eas-cli@latest init` (this links the project and adds its ID to `app.json`).
2. Change `ios.bundleIdentifier` and `android.package` in `app.json` from `com.methodv.app` to an ID you own (e.g. your domain backwards).
3. Add the same `EXPO_PUBLIC_…` values to EAS: `npx eas-cli@latest env:create` for the `preview` and `production` environments (or on expo.dev → your project → Environment variables).
4. Try it on real phones: `npx eas-cli@latest build --profile preview`. On Android you get an APK to install. iPhones need to be registered for internal builds, or use TestFlight.
5. Store builds: `npx eas-cli@latest build --profile production --platform all`, then `npx eas-cli@latest submit --platform ios` and `--platform android`. You need an Apple Developer account ($99/year) and a Google Play Console account ($25 once). Store listings need screenshots, a privacy policy URL and a support URL.

## Checks

```bash
npm run typecheck     # TypeScript
npm run bundle        # compiles the real iOS and Android bundles
npm run smoke         # builds the web version and clicks through every screen in Chromium
```

`npm run smoke` uses the website's Playwright install (run `npm install` in the repo root first). It stands in for a simulator, so it can't cover the camera, native video playback or Apple sign-in. Try those on a phone with Expo Go or a preview build.
