// Where tapping a push goes. Pushes carry a path on the website; the screens
// the app has (profiles, apps, questions) open in the app, anything else
// (like the inbox) opens on the website. No React Native imports, so the
// unit tests can load it.
export type PushTarget = { screen: string } | { web: string };

export function pushTarget(url: unknown): PushTarget {
  const raw = typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : "/";
  const path = raw.split("#")[0].split("?")[0] || "/";
  const m = path.match(/^\/(u|apps|q)\/([A-Za-z0-9_-]+)$/);
  if (m) return { screen: `/${m[1]}/${m[2]}` };
  if (path === "/") return { screen: "/" };
  return { web: raw };
}
