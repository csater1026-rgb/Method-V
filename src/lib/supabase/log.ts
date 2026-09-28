// Every database request the server makes goes through here. When a query is
// broken (a missing column, a permission it doesn't have, an ambiguous
// embed), the database answers with an error that a page often just shows as
// "nothing here". Logging each one puts the real reason in Vercel's logs.
//
// Expected answers aren't logged: a duplicate (23505, like saving a like
// twice), our own friendly messages (P0001, like "You're doing that too
// fast"), and "no row" from .single() (PGRST116). Only the table or function
// name is logged, never the query itself, which can hold what people typed.

const QUIET = new Set(["23505", "P0001", "PGRST116"]);

export function describeDatabaseError(method: string, url: string, status: number, body: string): string | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  if (!path.startsWith("/rest/v1/") || status < 400) return null;
  let code = "";
  let message = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { code?: unknown; message?: unknown };
    if (typeof parsed.code === "string") code = parsed.code;
    if (typeof parsed.message === "string") message = parsed.message.slice(0, 300);
  } catch {
    // not JSON: keep the start of the text
  }
  if (QUIET.has(code)) return null;
  return `database error: ${method} ${path.slice("/rest/v1".length)} -> ${status}${code ? ` ${code}` : ""}: ${message}`;
}

export const loggingFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (response.status >= 400) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET");
    // Read a copy, so the caller still gets the body.
    const body = await response
      .clone()
      .text()
      .catch(() => "");
    const line = describeDatabaseError(method, url, response.status, body);
    if (line) console.error(line);
  }
  return response;
};
