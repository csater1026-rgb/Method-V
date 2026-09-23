// Fast checks for pure logic: reading a site's title/description for posting,
// guessing a category, and the link checker's safety rules.
//
//   npm run test:unit

import { checkLink, fetchPage, isPublicAddress, parseAppUrl } from "../src/lib/link-check.ts";
import { guessCategory, parseMeta, sitePreview } from "../src/lib/site-preview.ts";
import { formatCents } from "../src/lib/constants.ts";
import { formEncode, verifyStripeSignature } from "../src/lib/stripe-core.ts";
import { createHmac } from "node:crypto";

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

ok(formatCents(500) === "$5" && formatCents(1425) === "$14.25" && formatCents(100000) === "$1,000", "money formats as dollars");

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
