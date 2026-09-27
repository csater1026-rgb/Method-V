import { createClient } from "@/lib/supabase/server";

const PROVIDER_NAMES: Record<string, string> = { email: "Email", google: "Google", apple: "Apple", github: "GitHub" };

// Your private account details at the top of Edit profile: only you see them.
export async function AccountInfo() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const providers = ((user.app_metadata?.providers as string[] | undefined) ?? [user.app_metadata?.provider ?? "email"])
    .map((p) => PROVIDER_NAMES[p] ?? p)
    .join(", ");
  const joined = new Date(user.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return (
    <section aria-label="Your account" className="mt-6 rounded-xl border border-line bg-surface p-4">
      <h2 className="display text-3xl">Your account</h2>
      <p className="mt-1 text-sm text-muted">Private: only you can see this.</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6">
        <dt className="text-muted">Email</dt>
        <dd className="font-medium break-all">{user.email}</dd>
        <dt className="text-muted">Signs in with</dt>
        <dd className="font-medium">{providers}</dd>
        <dt className="text-muted">Member since</dt>
        <dd className="font-medium">{joined}</dd>
      </dl>
    </section>
  );
}
