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

// Where each network's profile links live, and path words that aren't handles
// (posts, settings pages…). TikTok, YouTube and Threads profiles are /@handle.
const LINKS: Record<SocialKey, { hosts: string[]; at?: boolean; notHandles?: string[] }> = {
  x: { hosts: ["x.com", "twitter.com"], notHandles: ["i", "intent", "home", "search", "hashtag", "share", "explore", "settings"] },
  github: { hosts: ["github.com"], notHandles: ["orgs", "sponsors", "topics", "settings", "features", "marketplace", "explore"] },
  instagram: { hosts: ["instagram.com"], notHandles: ["p", "reel", "reels", "stories", "explore", "tv", "accounts", "direct"] },
  tiktok: { hosts: ["tiktok.com"], at: true },
  youtube: { hosts: ["youtube.com"], at: true },
  threads: { hosts: ["threads.net", "threads.com"], at: true },
};

// "@june", "june" or a pasted profile link from that network -> "june".
// Anything else (another site's link, a post or channel link) comes back as
// typed, so it fails the handle check and the person sees why.
export function cleanHandle(input: string, key: SocialKey): string {
  const raw = input.trim();
  if (!raw) return "";
  const looksLikeLink = /^https?:\/\//i.test(raw) || /^(www\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(raw);
  if (!looksLikeLink) return raw.replace(/^@/, "");
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return raw;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  const rule = LINKS[key];
  if (!rule.hosts.includes(host)) return raw;
  let first: string;
  try {
    first = decodeURIComponent(url.pathname.split("/").filter(Boolean)[0] ?? "");
  } catch {
    return raw;
  }
  if (rule.at) return first.startsWith("@") ? first.slice(1) : raw;
  if (!first || first.startsWith("@") || rule.notHandles?.includes(first.toLowerCase())) return raw;
  return first;
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
