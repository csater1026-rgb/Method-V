// Method V is for members: signed-out visitors see the welcome page (/login)
// before anything else. These stay open because they have to work without an
// account: signing in, the webhooks and APIs, embeds and badges on other
// sites, "Try it" links, the app icon and install files, and setup pages.

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
const OPEN_EXACT = ["/login", "/offline", "/app", "/sw.js", "/manifest.webmanifest", "/robots.txt", "/apple-icon", "/icon.svg", "/favicon.ico"];

export function isOpenPath(pathname: string): boolean {
  return OPEN_EXACT.includes(pathname) || OPEN_PREFIXES.some((p) => pathname.startsWith(p));
}

// Where to send a signed-out visitor: the welcome page, then back here.
export function welcomeUrl(pathname: string, search: string): string {
  const back = pathname + search;
  return back === "/" ? "/login" : `/login?next=${encodeURIComponent(back)}`;
}
