import "server-only";

import dns from "node:dns";
import net from "node:net";

import { Agent, fetch } from "undici";

// Checks that an app's link loads before it goes live. The server makes this
// request, so it refuses anything that resolves to a private or internal
// address, re-checking every redirect and every DNS answer at connect time.

export type LinkCheckResult = { ok: true; finalUrl: string } | { ok: false; reason: string };

const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;
const ALLOWED_PORTS = new Set(["", "80", "443"]);
// Sites that answer these are up, they just don't like bots.
const UP_BUT_BLOCKING = new Set([401, 403, 405, 429]);

const blocked = new net.BlockList();
for (const [prefix, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(prefix, bits, "ipv4");
}
for (const [prefix, bits] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(prefix, bits, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]);
    return !blocked.check(address, "ipv6");
  }
  return false;
}

// Used by the HTTP client for every connection, so a hostname can't pass the
// check and then resolve somewhere private when the request is made.
function safeLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void,
) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const safe = addresses.filter((a) => isPublicAddress(a.address));
    if (safe.length === 0) {
      const e: NodeJS.ErrnoException = new Error(`${hostname} points to a private address`);
      e.code = "EPRIVATE";
      return callback(e, []);
    }
    if (options.all) callback(null, safe);
    else callback(null, safe[0].address, safe[0].family);
  });
}

const agent = new Agent({ connect: { lookup: safeLookup, timeout: TIMEOUT_MS } });

export function parseAppUrl(input: string): URL | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (!ALLOWED_PORTS.has(url.port)) return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && !isPublicAddress(host)) return null;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return null;
  }
  if (!net.isIP(host) && !host.includes(".")) return null;
  return url;
}

const MAX_HTML_BYTES = 256 * 1024;

type FollowResult = { ok: true; finalUrl: string; html: string | null } | { ok: false; reason: string };

// Follows the link (re-checking every redirect), and optionally reads the
// start of an HTML page so we can pull its title and description.
async function follow(input: string, readHtml: boolean): Promise<FollowResult> {
  const start = parseAppUrl(input);
  if (!start) return { ok: false, reason: "Enter a public http:// or https:// link." };
  let url: URL = start;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        dispatcher: agent,
        signal: controller.signal,
        headers: {
          "user-agent": "MethodV-LinkCheck/1.0 (+https://github.com/csater1026-rgb/Method-V)",
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        },
      });

      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel();
        const location = res.headers.get("location");
        const next: URL | null = location ? parseAppUrl(new URL(location, url).toString()) : null;
        if (!next) return { ok: false, reason: "The link redirects somewhere we can't check." };
        url = next;
        continue;
      }
      if (res.status < 300 || UP_BUT_BLOCKING.has(res.status)) {
        const isHtml = (res.headers.get("content-type") ?? "").includes("html");
        const html = readHtml && res.status < 300 && isHtml ? await readStart(res.body) : null;
        if (html === null) await res.body?.cancel();
        return { ok: true, finalUrl: url.toString(), html };
      }
      await res.body?.cancel();
      if (res.status === 404 || res.status === 410) return { ok: false, reason: "That page wasn't found (404)." };
      return { ok: false, reason: `The site answered with an error (${res.status}).` };
    }
    return { ok: false, reason: "The link redirects too many times." };
  } catch (err) {
    if (controller.signal.aborted) return { ok: false, reason: "The site took too long to answer." };
    const code = (err as { cause?: { code?: string } })?.cause?.code;
    if (code === "EPRIVATE") return { ok: false, reason: "That link points to a private network address." };
    if (code === "ENOTFOUND") return { ok: false, reason: "That domain doesn't exist." };
    return { ok: false, reason: "We couldn't reach that site." };
  } finally {
    clearTimeout(timer);
  }
}

// Reads at most MAX_HTML_BYTES of the page, then stops downloading.
type ByteStream = {
  getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> };
};

async function readStart(body: ByteStream | null): Promise<string | null> {
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const all = new Uint8Array(Math.min(size, MAX_HTML_BYTES));
  let offset = 0;
  for (const c of chunks) {
    const part = c.subarray(0, Math.min(c.byteLength, all.byteLength - offset));
    all.set(part, offset);
    offset += part.byteLength;
    if (offset >= all.byteLength) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(all);
}

export async function checkLink(input: string): Promise<LinkCheckResult> {
  const result = await follow(input, false);
  return result.ok ? { ok: true, finalUrl: result.finalUrl } : result;
}

// Checks the link and returns the page's HTML (the first 256 KB) when it's a web page.
export async function fetchPage(input: string): Promise<FollowResult> {
  return follow(input, true);
}
