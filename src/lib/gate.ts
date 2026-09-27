// Method V is for members: signed-out visitors see the welcome page (/login)
// before anything else. These stay open because they have to work without an
// account: signing in, the webhooks and APIs, embeds and badges on other
// sites, "Try it" links, the app icon and install files, setup pages, and
// the Terms and Privacy Policy (people read them before signing up).

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
const OPEN_EXACT = ["/login", "/terms", "/privacy", "/offline", "/app", "/sw.js", "/manifest.webmanifest", "/robots.txt", "/apple-icon", "/icon.svg", "/favicon.ico"];

export function isOpenPath(pathname: string): boolean {
  return OPEN_EXACT.includes(pathname) || OPEN_PREFIXES.some((p) => pathname.startsWith(p));
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
