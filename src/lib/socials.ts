// Social handles on a profile: which networks, how a handle must look, and
// the link it becomes. Shared by the website (form, save, profile) and the
// app. Must match the checks on public.profiles.

export type SocialKey = "x" | "github" | "instagram" | "tiktok" | "youtube" | "threads";

export const SOCIALS: {
  key: SocialKey;
  column: string;
  label: string;
  pattern: RegExp;
  url: (handle: string) => string;
  // Shown on the profile, e.g. "@june" or "june".
  show: (handle: string) => string;
  // Added in 20261002000000_socials.sql (older databases don't have them yet).
  newer?: boolean;
}[] = [
  { key: "x", column: "x_handle", label: "X", pattern: /^[A-Za-z0-9_]{1,15}$/, url: (h) => `https://x.com/${h}`, show: (h) => `@${h}` },
  {
    key: "github",
    column: "github_handle",
    label: "GitHub",
    pattern: /^[A-Za-z0-9-]{1,39}$/,
    url: (h) => `https://github.com/${h}`,
    show: (h) => h,
  },
  {
    key: "instagram",
    column: "instagram_handle",
    label: "Instagram",
    pattern: /^[A-Za-z0-9._]{1,30}$/,
    url: (h) => `https://instagram.com/${h}`,
    show: (h) => `@${h}`,
    newer: true,
  },
  {
    key: "tiktok",
    column: "tiktok_handle",
    label: "TikTok",
    pattern: /^[A-Za-z0-9._]{2,24}$/,
    url: (h) => `https://www.tiktok.com/@${h}`,
    show: (h) => `@${h}`,
    newer: true,
  },
  {
    key: "youtube",
    column: "youtube_handle",
    label: "YouTube",
    pattern: /^[A-Za-z0-9._-]{3,30}$/,
    url: (h) => `https://youtube.com/@${h}`,
    show: (h) => `@${h}`,
    newer: true,
  },
  {
    key: "threads",
    column: "threads_handle",
    label: "Threads",
    pattern: /^[A-Za-z0-9._]{1,30}$/,
    url: (h) => `https://www.threads.net/@${h}`,
    show: (h) => `@${h}`,
    newer: true,
  },
];

// "@june", "june" or a pasted profile link -> "june". Empty stays empty.
export function cleanHandle(input: string): string {
  let h = input.trim();
  const fromUrl = h.match(/^https?:\/\/[^/]+\/(?:@)?([^/?#]+)/i);
  if (fromUrl) h = fromUrl[1];
  return h.replace(/^@/, "");
}

type WithSocials = {
  website_url?: string | null;
  linkedin_url?: string | null;
} & Partial<Record<string, unknown>>;

export type SocialLink = { key: string; label: string; text: string; href: string };

// Every link a profile has, in a steady order: website first, then networks.
export function socialLinks(profile: WithSocials): SocialLink[] {
  const out: SocialLink[] = [];
  if (profile.website_url) {
    out.push({ key: "website", label: "Website", text: hostnameOf(profile.website_url), href: profile.website_url });
  }
  for (const s of SOCIALS) {
    const handle = profile[s.column];
    if (typeof handle === "string" && handle) out.push({ key: s.key, label: s.label, text: s.show(handle), href: s.url(handle) });
  }
  if (profile.linkedin_url) out.push({ key: "linkedin", label: "LinkedIn", text: "LinkedIn", href: profile.linkedin_url });
  return out;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
