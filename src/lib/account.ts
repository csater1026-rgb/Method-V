// Delete account asks you to type your username to confirm. Shared by the
// website form, the app's Me tab and the server (src/lib/delete-account.ts).
export function confirmMatches(typed: string, username: string): boolean {
  return username.length > 0 && typed.trim().replace(/^@/, "").toLowerCase() === username.toLowerCase();
}
