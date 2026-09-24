// Fast checks for pure logic: reading a site's title/description for posting,
// guessing a category, and the link checker's safety rules.
//
//   npm run test:unit

import { checkLink, fetchPage, isPublicAddress, parseAppUrl } from "../src/lib/link-check.ts";
import { guessCategory, parseMeta, sitePreview } from "../src/lib/site-preview.ts";
import { formatCents } from "../src/lib/constants.ts";
import { formEncode, verifyStripeSignature } from "../src/lib/stripe-core.ts";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { PIXEL_ICON_SVG } from "../src/lib/pixel-icon.ts";
import { bundle } from "../scripts/bundle-migrations.mjs";
import { SOCIALS, cleanHandle, socialLinks } from "../src/lib/socials.ts";
import { deadExpoTokens, isExpoToken, secretMatches, toMessage } from "../src/lib/push-core.ts";
import webpush from "web-push";
import { bumpInterest, mergeInterests, parseInterests, rankFeed, serializeInterests } from "../src/lib/interests.ts";

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) failures++;
};

// --- Site preview ---
const html = `<!doctype html><html><head>
  <title>NoteFlow — Meeting notes that turn into to-dos</title>
  <meta name="description" content="Paste or record a meeting and get decisions, owners &amp; deadlines.">
  <meta property='og:site_name' content='NoteFlow'>
  <meta content="NoteFlow — Meeting notes that turn into to-dos" property="og:title">
</head><body>…</body></html>`;
const p = sitePreview(html, "https://noteflow.app");
ok(p.name === "NoteFlow", `name from og:site_name (${p.name})`);
ok(p.tagline === "Meeting notes that turn into to-dos", `tagline from the title after the dash (${p.tagline})`);
ok(p.description === "Paste or record a meeting and get decisions, owners & deadlines.", "description decoded from meta");
ok(p.category === "productivity", `category guessed (${p.category})`);

const bare = sitePreview("<html><head><title>palettepal</title></head></html>", "https://www.palettepal.io/x");
ok(bare.name === "Palettepal" && bare.tagline === "", `title-only page: capitalized name, empty tagline (${JSON.stringify(bare)})`);
const none = sitePreview("<html><body>hi</body></html>", "https://www.splitsy.co/");
ok(none.name === "Splitsy", `no title: name from the domain (${none.name})`);
const long = sitePreview(`<title>X</title><meta name="description" content="${"word ".repeat(60)}">`, "https://x.dev");
ok(long.tagline.length <= 120 && long.tagline.endsWith("…"), "long taglines are clipped at a word");

ok(parseMeta(`<meta name=description content=unquoted>`).meta.description === "unquoted", "unquoted attributes");
ok(parseMeta(`<title>A &#x26; B &#39;s</title>`).title === "A & B 's", "numeric entities decode");
ok(guessCategory("A CLI for developers") === "dev-tools", "dev tools");
ok(guessCategory("Turn any lesson into a quiz") === "education", "education");
ok(guessCategory("Split a group bill") === "finance", "finance");
ok(guessCategory("Accessible color palettes") === "design", "design");
ok(guessCategory("Chat with an AI agent") === "ai", "ai");
ok(guessCategory("Something else entirely") === null, "no match → no guess");

// --- Link safety ---
for (const a of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1", "100.64.0.1"]) {
  ok(!isPublicAddress(a), `private ${a}`);
}
for (const a of ["8.8.8.8", "2606:4700:4700::1111"]) ok(isPublicAddress(a), `public ${a}`);
for (const u of ["javascript:alert(1)", "file:///etc/passwd", "http://localhost:3000", "http://[::1]/", "https://example.com:8080/", "https://u:p@example.com/", "http://intranet/"]) {
  ok(parseAppUrl(u) === null, `rejects ${u}`);
}
ok(parseAppUrl("https://my-app.vercel.app") !== null, "accepts a normal https link");
const local = await checkLink("http://127.0.0.1/");
ok(!local.ok, "link check refuses a local address");
const localPage = await fetchPage("http://127.0.0.1/");
ok(!localPage.ok, "page fetch refuses a local address");
const bad = await fetchPage("https://nonexistent-domain-for-method-v-test.invalid/");
ok(!bad.ok, "page fetch fails cleanly on an unknown domain");

// --- Stripe helpers ---
const encoded = formEncode({
  mode: "payment",
  metadata: { payment_id: "p1" },
  line_items: [{ quantity: 1, price_data: { unit_amount: 500, product_data: { name: "Tip & thanks" } } }],
  skip: undefined,
});
ok(
  decodeURIComponent(encoded) ===
    "mode=payment&metadata[payment_id]=p1&line_items[0][quantity]=1&line_items[0][price_data][unit_amount]=500&line_items[0][price_data][product_data][name]=Tip & thanks",
  `form encoding nests keys like Stripe expects (${decodeURIComponent(encoded)})`,
);
ok(encoded.includes("Tip%20%26%20thanks"), "form values are escaped");

const secret = "whsec_test";
const body = '{"type":"checkout.session.completed"}';
const now = 1_800_000_000;
const sign = (t: number, payload = body, key = secret) => createHmac("sha256", key).update(`${t}.${payload}`).digest("hex");
ok(verifyStripeSignature(body, `t=${now},v1=${sign(now)}`, secret, now), "a correctly signed webhook passes");
ok(verifyStripeSignature(body, `t=${now},v1=${"0".repeat(64)},v1=${sign(now)}`, secret, now), "any matching v1 signature passes (secret rotation)");
ok(!verifyStripeSignature(body + " ", `t=${now},v1=${sign(now)}`, secret, now), "a changed body fails");
ok(!verifyStripeSignature(body, `t=${now},v1=${sign(now, body, "whsec_other")}`, secret, now), "the wrong secret fails");
ok(!verifyStripeSignature(body, `t=${now - 600},v1=${sign(now - 600)}`, secret, now), "an old (replayed) webhook fails");
ok(!verifyStripeSignature(body, null, secret, now) && !verifyStripeSignature(body, "garbage", secret, now), "a missing or junk header fails");
ok(!verifyStripeSignature(body, `t=${now},v1=${sign(now)}`, "", now), "no secret configured fails closed");
ok(!verifyStripeSignature(body, `t=${now},v1=abc`, secret, now), "a short signature fails without throwing");

ok(PIXEL_ICON_SVG === readFileSync(new URL("../src/app/icon.svg", import.meta.url), "utf8").trim(), "home-screen icon matches the favicon");

ok(readFileSync(new URL("../supabase/setup.sql", import.meta.url), "utf8") === bundle(), "supabase/setup.sql matches the migrations (run npm run db:bundle)");

ok(formatCents(500) === "$5" && formatCents(1425) === "$14.25" && formatCents(100000) === "$1,000", "money formats as dollars");

// --- For you: interests and ranking ---
{
  const parsed = parseInterests("design:4.5,games:1,bogus:9,finance:-2,education:abc");
  ok(JSON.stringify(parsed) === JSON.stringify({ design: 4.5, games: 1 }), `interests cookie keeps only real categories and positive scores (${JSON.stringify(parsed)})`);
  ok(JSON.stringify(parseInterests(encodeURIComponent("design:2,games:1"))) === JSON.stringify({ design: 2, games: 1 }), "reads an encoded cookie");
  ok(JSON.stringify(parseInterests("%E0%A4%A")) === "{}", "a broken cookie reads as no interests");
  ok(serializeInterests(parseInterests("design:4.5,games:1")) === "design:4.5,games:1", "round trip");
  let big = {};
  for (let i = 0; i < 40; i++) big = bumpInterest(big, i % 4 ? "design" : "games", 3);
  const total = Object.values(big).reduce((a: number, b) => a + (b as number), 0);
  ok(Math.abs(total - 60) < 0.01 && (big as { design: number }).design > (big as { games: number }).games, `scores stay capped and keep their balance (${total.toFixed(1)})`);
  ok(JSON.stringify(bumpInterest({ design: 0.3 }, "design", -0.5)) === JSON.stringify({ design: 0 }), "skips never go below zero");
  ok(JSON.stringify(bumpInterest({}, "not-a-category", 3)) === "{}", "unknown categories are ignored");
  ok(JSON.stringify(mergeInterests({ design: 1 }, { design: 2, games: 1 })) === JSON.stringify({ design: 3, games: 1 }), "interests from the browser and the account add up");

  const now = Date.parse("2026-09-24T12:00:00Z");
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const drop = (id: string, category: string, owner: string, h: number, likes = 0) => ({
    id, owner_id: owner, like_count: likes, comment_count: 0, created_at: hoursAgo(h), app: { category, try_count: 0 },
  });
  const pool = [drop("new-game", "games", "a", 1), drop("design", "design", "b", 30), drop("old-hit", "finance", "c", 200, 400)];
  const ids = (list: { id: string }[]) => list.map((d) => d.id).join(",");
  ok(ids(rankFeed(pool, { now }))[0] === "n", `no interests: the newest leads (${ids(rankFeed(pool, { now }))})`);
  ok(rankFeed(pool, { now, interests: { design: 10 } })[0].id === "design", "into design: the design Drop leads");
  ok(rankFeed(pool, { now, following: new Set(["c"]) })[0].id === "old-hit", "a followed builder's popular Drop comes up");
  ok(rankFeed(pool, { now, viewerId: "a" })[0].id !== "new-game", "your own Drop doesn't lead your feed");
  const same = [drop("a1", "games", "a", 1), drop("a2", "games", "a", 1.1), drop("b1", "design", "b", 3)];
  ok(ids(rankFeed(same, { now })) === "a1,b1,a2", `the same builder twice in a row gets split up (${ids(rankFeed(same, { now }))})`);
  ok(rankFeed(pool, { now }).length === 3, "nothing is dropped");
}

// --- Social handles ---
ok(cleanHandle("@june", "x") === "june" && cleanHandle(" june ", "instagram") === "june", "handles drop the @ and spaces");
ok(cleanHandle("https://www.instagram.com/june.designs/", "instagram") === "june.designs", "a pasted Instagram link becomes the handle");
ok(cleanHandle("instagram.com/june.designs", "instagram") === "june.designs", "…even without https://");
ok(cleanHandle("https://www.tiktok.com/@junedesigns?lang=en", "tiktok") === "junedesigns", "a pasted TikTok link becomes the handle");
ok(cleanHandle("https://m.youtube.com/@june-d", "youtube") === "june-d", "a pasted YouTube link becomes the handle");
ok(cleanHandle("https://twitter.com/june", "x") === "june" && cleanHandle("https://x.com/june", "x") === "june", "X takes x.com and twitter.com links");
for (const [input, key, why] of [
  ["https://www.youtube.com/channel/UCabc123", "youtube", "a YouTube channel link"],
  ["https://youtube.com/user/june", "youtube", "a YouTube /user link"],
  ["https://instagram.com/p/Cx1abc/", "instagram", "an Instagram post"],
  ["https://github.com/june", "x", "a GitHub link in the X field"],
  ["https://x.com/i/status/123", "x", "a post on X"],
  ["https://evil.example/june", "instagram", "another site"],
] as const) {
  const out = cleanHandle(input, key);
  ok(!SOCIALS.find((so) => so.key === key)!.pattern.test(out), `${why} isn't taken as a handle (${out})`);
}
ok(cleanHandle("", "x") === "", "empty stays empty");
{
  const links = socialLinks({ website_url: "https://www.example.com/me", x_handle: "june", instagram_handle: "june.d", linkedin_url: "https://linkedin.com/in/june" });
  ok(links.map((l) => l.key).join(",") === "website,x,instagram,linkedin", `links in a steady order (${links.map((l) => l.key).join(",")})`);
  ok(links[0].text === "example.com" && links[2].href === "https://instagram.com/june.d", "website shows its domain; Instagram links to the profile");
  ok(SOCIALS.every((so) => so.pattern.test("june")), "every network accepts a plain handle");
}

// --- Push notifications ---
ok(secretMatches("s3cret-value", "s3cret-value") && !secretMatches("s3cret-valuX", "s3cret-value"), "webhook secret must match exactly");
ok(!secretMatches("", "") && !secretMatches("anything", "") && !secretMatches(null, "x"), "no secret set: nothing gets in");
ok(toMessage({ id: 1, user_id: "u", kind: "follows", title: "New follower", body: "@june followed you", url: "/u/june" }).url === "/u/june", "a push opens its page");
ok(toMessage({ id: 1, user_id: "u", kind: "follows", title: "t", body: "b", url: "//evil.example" }).url === "/", "…and never another site");
ok(isExpoToken("ExponentPushToken[abc123]") && isExpoToken("ExpoPushToken[abc]") && !isExpoToken("abc"), "only Expo push tokens go to Expo");
ok(
  JSON.stringify(deadExpoTokens(["a", "b", "c"], { data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }, { status: "error", details: { error: "MessageRateExceeded" } }] })) === '["b"]',
  "uninstalled apps are cleaned up; other errors aren't",
);
{
  // Keys made the way /setup/push-keys makes them work with web-push.
  const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  const privateKey = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d!;
  let works = true;
  try {
    webpush.setVapidDetails("mailto:push@methodv.app", publicKey, privateKey);
    const client = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const p256dh = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", client.publicKey)));
    const auth = b64url(crypto.getRandomValues(new Uint8Array(16)));
    const req = webpush.generateRequestDetails({ endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh, auth } }, JSON.stringify({ title: "t" }));
    works = Boolean(req.headers.Authorization) && req.body instanceof Buffer;
  } catch (e) {
    works = false;
    console.log(e);
  }
  ok(works && publicKey.length === 87 && privateKey.length === 43, "keys from /setup/push-keys sign and encrypt a browser push");
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
