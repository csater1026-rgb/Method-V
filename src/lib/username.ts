// Usernames: the rule, the placeholder every new account starts with, and a
// better first suggestion. Shared by the website and the phone app.

// 3-24 characters: lowercase letters, numbers and _.
export const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
export const USERNAME_HINT = "3–24 characters: lowercase letters, numbers and _.";

// New accounts get "builder_" plus 10 characters of their account id (see
// handle_new_user in the first migration) until they pick their own.
export function isDefaultUsername(username: string | null | undefined): boolean {
  return /^builder_[0-9a-f]{10}$/.test(username ?? "");
}

// A starting point for the username box: from their name, else the part of
// their email before the @. Empty when neither gives 3 usable characters.
export function suggestUsername(name: string | null | undefined, email: string | null | undefined): string {
  const clean = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24)
      .replace(/_+$/, "");
  for (const source of [name ?? "", (email ?? "").split("@")[0]]) {
    const s = clean(source);
    if (s.length >= 3 && !isDefaultUsername(s)) return s;
  }
  return "";
}

// Set when someone taps "Skip for now" on /welcome, so it isn't shown again.
export const PROFILE_LATER_COOKIE = "mv-profile-later";
