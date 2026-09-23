// Supabase settings. When they're missing the site runs in demo mode: it shows
// sample data and every write explains how to connect a project.

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const DEMO_MODE_MESSAGE =
  "Method V is running in demo mode. Add your Supabase keys to .env.local (see README) to sign in and post.";

export const DROPS_BUCKET = "drops";

export function publicFileUrl(path: string | null): string | null {
  if (!path || !isSupabaseConfigured) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl}/storage/v1/object/public/${DROPS_BUCKET}/${encoded}`;
}
