// Method V is for members: signed-out visitors see the welcome page (/login)
// before anything else. These stay open because they have to work without an
// account: signing in, the webhooks and APIs, embeds and badges on other
// sites, "Try it" links, the app icon and install files, the picture link
// previews show, setup pages, and the Terms and Privacy Policy (people read
// them before signing up).

// Everything inside these folders...
const OPEN_PREFIXES = [
  "/auth/",
  "/api/",
  "/embed/",
  "/badge/",
  "/try/",
  "/go/",
  "/app-icon/",
  "/setup/",
];

// ...and exactly these pages and files.
const OPEN_EXACT = ["/login", "/terms", "/privacy", "/offline", "/app", "/sw.js", "/manifest.webmanifest", "/robots.txt", "/apple-icon", "/icon.svg", "/favicon.ico", "/opengraph-image"];

export function isOpenPath(pathname: string): boolean {
  return OPEN_EXACT.includes(pathname) || OPEN_PREFIXES.some((p) => pathname.startsWith(p));
}

// Where to go after signing in or agreeing: only a path on this site. Not
// "//other.site", and no backslashes, spaces, tabs or newlines anywhere:
// browsers drop tabs and newlines from links, so "/<tab>/other.site" would
// really be "//other.site", another website.
export function safeNextPath(value: string | null | undefined): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return /[\\\s\p{Cc}]/u.test(value) ? "/" : value;
}

// Link previews: when someone shares an app's link in a text, on X, Slack,
// Discord and so on, the app that draws the preview card asks for the page
// without an account. Instead of the welcome page, those preview bots get a
// small page with just the app's name, tagline and cover picture (all public
// anyway: embeds and the API show the same). People still sign in first.
const PREVIEW_BOTS =
  /facebookexternalhit|facebot|twitterbot|slackbot|slack-imgproxy|discordbot|linkedinbot|whatsapp|telegrambot|skypeuripreview|applebot|redditbot|pinterest|embedly|mastodon|bluesky|cardyb|iframely|snapchat|vkshare|zoominfobot|google-pagerenderer/i;

export function isPreviewBot(userAgent: string | null | undefined): boolean {
  return typeof userAgent === "string" && PREVIEW_BOTS.test(userAgent);
}

// The preview page for a signed-out preview bot asking for `pathname`, or null.
export function previewFor(pathname: string, userAgent: string | null | undefined): string | null {
  if (!isPreviewBot(userAgent)) return null;
  const app = /^\/apps\/([a-z0-9-]{1,60})\/?$/.exec(pathname);
  return app ? `/preview/apps/${app[1]}` : null;
}

// Where to send a signed-out visitor: the welcome page, then back here.
export function welcomeUrl(pathname: string, search: string): string {
  const back = pathname + search;
  return back === "/" ? "/login" : `/login?next=${encodeURIComponent(back)}`;
}

// Everyone agrees to the Terms and Privacy Policy once. Email sign-ups tick a
// box; people who signed up with Google, Apple or GitHub (or before the box
// existed) are sent to /agree first. The date they agreed to is saved on the
// account as user_metadata.agreed_to_terms.
export const AGREE_PATH = "/agree";

export function hasAgreedToTerms(metadata: unknown): boolean {
  const agreed = (metadata as { agreed_to_terms?: unknown } | null | undefined)?.agreed_to_terms;
  return typeof agreed === "string" && agreed.length > 0;
}

// A signed-in person who hasn't agreed yet, on a page that needs it.
export function mustAgree(metadata: unknown, pathname: string): boolean {
  return !hasAgreedToTerms(metadata) && pathname !== AGREE_PATH && !isOpenPath(pathname);
}

export function agreeUrl(pathname: string, search: string): string {
  const back = pathname + search;
  return back === "/" ? AGREE_PATH : `${AGREE_PATH}?next=${encodeURIComponent(back)}`;
}
