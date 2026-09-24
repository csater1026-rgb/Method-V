# Method V mobile app

Read `README.md` here and `../AGENTS.md` (the website's rules; the database rules apply to the app too).

- The app reads and writes Supabase directly as the signed-in person, so row level security does the enforcing. Anything the website does with the secret key (the link check when posting) goes through the website: `/api/mobile/*`, authenticated with the app's access token (`src/lib/supabase/bearer.ts` in the website). Never put a secret key in `EXPO_PUBLIC_*`.
- Shared, dependency-free files come from the website as `@shared/*` (`../src/lib/constants.ts`, `types.ts`, `demo.ts`, `format.ts`, `pixel-v.ts`; see `metro.config.js`). Don't copy them. Don't import anything from `../src` that imports `server-only`, Next or Supabase server code.
- Every screen works in demo mode (no `EXPO_PUBLIC_SUPABASE_*`), using the shared sample data. Writes return `DEMO_MESSAGE`.
- "Try it" goes through `recordTry()` (source `app`, or `sponsor` for sponsor cards) and opens the app in an in-app browser. Sponsor cards stay labeled Sponsored.
- Use the palette and fonts in `src/theme.ts` (the same tokens as the website). Video and posters stay dark (`media`). Keep tap targets at least 44pt, and respect Reduce Motion.
- The Expo docs site may be unreachable from this environment. Check APIs against the installed type definitions in `node_modules` and run `npm run typecheck`.
- Install packages with `EXPO_OFFLINE=1 npx expo install <pkg>` (it uses the SDK's bundled version list when api.expo.dev can't be reached).
- Before committing: `npm run typecheck`, `npm run bundle`, and `npm run smoke`.

---

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
