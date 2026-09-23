// Settings come from EXPO_PUBLIC_* variables (see mobile/README.md). Without
// Supabase keys the app runs in demo mode with the website's sample data, and
// anything that would write explains how to connect a project.

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
// The website (for posting, which needs the server's link check).
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

export const isLive = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const DEMO_MESSAGE =
  "This is a demo build. Add your Supabase keys to mobile/.env (see mobile/README.md) to sign in and post.";

export const DROPS_BUCKET = "drops";

export function fileUrl(path: string | null | undefined): string | null {
  if (!path || !isLive) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${DROPS_BUCKET}/${encoded}`;
}

// One-tap sign-in buttons, once they're turned on in Supabase (see README):
// EXPO_PUBLIC_AUTH_PROVIDERS=google,apple. Apple only shows on iPhone/iPad.
const providers: string = process.env.EXPO_PUBLIC_AUTH_PROVIDERS ?? "";
export const AUTH_PROVIDERS = providers
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter((s): s is "google" | "apple" => s === "google" || s === "apple");

export { MIN_PASSWORD } from "@shared/constants";
