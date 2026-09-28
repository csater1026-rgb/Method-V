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
import { pushTarget } from "../src/lib/push-route.ts";
import { bumpInterest, mergeInterests, parseInterests, rankFeed, serializeInterests } from "../src/lib/interests.ts";
import { setUpFirst, topUpSuggestions } from "../src/lib/suggest.ts";
import { EMAIL_TEMPLATES } from "../src/lib/email-templates.ts";
import { agreeUrl, hasAgreedToTerms, isOpenPath, mustAgree, safeNextPath, welcomeUrl } from "../src/lib/gate.ts";
import { confirmMatches } from "../src/lib/account.ts";
import { describeDatabaseError, loggingFetch } from "../src/lib/supabase/log.ts";
import { dbMessage, withVCoin } from "../src/lib/db-errors.ts";

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
for (const a of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "2002:7f00:1::", "100.64.0.1"]) {
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

// Tapping a push in the app.
ok(JSON.stringify(pushTarget("/u/june_designs")) === '{"screen":"/u/june_designs"}', "a follower push opens their profile");
ok(JSON.stringify(pushTarget("/apps/palettepal#feedback")) === '{"screen":"/apps/palettepal"}', "a feedback push opens the app");
ok(JSON.stringify(pushTarget("/q/2b1f6c0e-1111-2222-3333-444455556666")) === '{"screen":"/q/2b1f6c0e-1111-2222-3333-444455556666"}', "a question push opens the thread");
ok(JSON.stringify(pushTarget("/inbox/june_designs")) === '{"web":"/inbox/june_designs"}', "a message opens the inbox on the website");
ok(JSON.stringify(pushTarget("https://evil.example")) === '{"screen":"/"}' && JSON.stringify(pushTarget("//evil.example")) === '{"screen":"/"}', "never another site");

// "Builders like you" on a young site: fill with the newest builders.
{
  const p = (id: string) => ({ id });
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id).join(",");
  ok(ids(topUpSuggestions([], [p("me"), p("b"), p("c")], ["me"])) === "b,c", "no one in common yet → newest builders, never yourself");
  ok(ids(topUpSuggestions([p("a")], [p("a"), p("b"), p("c")], ["me", "c"])) === "a,b", "matches first, no repeats, skips people you follow");
  ok(topUpSuggestions([], Array.from({ length: 20 }, (_, i) => p(`n${i}`)), []).length === 8, "at most 8 suggestions");
  const people = ["builder_3f9a1c2b7d", "june_designs", "builder_aaaaaaaaaa", "methodv"].map((username) => ({ username }));
  ok(setUpFirst(people).map((x) => x.username).join() === "june_designs,methodv,builder_3f9a1c2b7d,builder_aaaaaaaaaa", "builders with a real username come before brand-new placeholder accounts (which still show)");
}

// Method V's sign-in emails (pasted into Supabase from /setup/emails).
{
  const by = (name: string) => EMAIL_TEMPLATES.find((t) => t.supabaseName === name)!;
  ok(EMAIL_TEMPLATES.length === 6, "all six Supabase email templates");
  ok(["Confirm sign up", "Magic link", "Reauthentication"].every((n) => by(n).html.includes("{{ .Token }}")), "the emails the app needs carry the 6-digit code");
  ok(["Confirm sign up", "Magic link", "Reset password", "Change email address", "Invite user"].every((n) => by(n).html.includes('href="{{ .ConfirmationURL }}"')), "and the others the link");
  ok(EMAIL_TEMPLATES.every((t) => (t.html.match(/\{\{[^}]*\}\}/g) ?? []).every((p) => /^\{\{ \.(Token|ConfirmationURL|Email|NewEmail) \}\}$/.test(p))), "only Supabase's own placeholders");
  ok(EMAIL_TEMPLATES.every((t) => t.subject.includes("Method V") && t.html.includes("METHOD")), "every email says it's from Method V");
}

// Signed-out visitors see the welcome page first; only what must work without
// an account stays open.
{
  const gated = ["/", "/drops", "/browse", "/apps/noteflow", "/u/methodv", "/q/abc", "/credits", "/challenges", "/settings", "/loginx", "/api", "/termsx"];
  const open = ["/login", "/auth/callback", "/api/push/send", "/api/stripe/webhook", "/api/health", "/embed/noteflow", "/badge/noteflow", "/try/noteflow", "/go/noteflow", "/sw.js", "/manifest.webmanifest", "/app-icon/192", "/setup/emails", "/offline", "/terms", "/privacy", "/opengraph-image"];
  ok(gated.every((p) => !isOpenPath(p)), `the site itself needs an account (${gated.filter(isOpenPath).join(", ") || "all gated"})`);
  ok(open.every(isOpenPath), `sign-in, webhooks, embeds and icons still work signed out (${open.filter((p) => !isOpenPath(p)).join(", ") || "all open"})`);
  ok(welcomeUrl("/", "") === "/login" && welcomeUrl("/apps/noteflow", "?tab=qa") === "/login?next=%2Fapps%2Fnoteflow%3Ftab%3Dqa", "after signing in you land where you were going");
  // Agreeing to the Terms once: Google/Apple/GitHub sign-ups (and older accounts) go to /agree first.
  ok(!hasAgreedToTerms({}) && !hasAgreedToTerms(null) && !hasAgreedToTerms({ agreed_to_terms: "" }), "no agreement saved means not agreed");
  ok(hasAgreedToTerms({ agreed_to_terms: "September 27, 2026" }), "a saved agreement date counts");
  ok(mustAgree({}, "/") && mustAgree({ full_name: "Ada" }, "/apps/noteflow"), "signed in without agreeing: sent to /agree");
  ok(!mustAgree({}, "/agree") && !mustAgree({}, "/terms") && !mustAgree({}, "/privacy") && !mustAgree({}, "/api/stripe/webhook") && !mustAgree({}, "/auth/callback"), "/agree, the Terms, Privacy, webhooks and sign-in still work before agreeing");
  ok(!mustAgree({ agreed_to_terms: "September 27, 2026" }, "/"), "once agreed, never asked again");
  ok(agreeUrl("/", "") === "/agree" && agreeUrl("/u/ada", "?x=1") === "/agree?next=%2Fu%2Fada%3Fx%3D1", "after agreeing you land where you were going");
  // After signing in, only ever back to a page on this site.
  ok(safeNextPath("/apps/noteflow?tab=qa#discuss") === "/apps/noteflow?tab=qa#discuss" && safeNextPath("/") === "/", "a page on this site is kept");
  for (const evil of ["//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/\r//evil.example", "https://evil.example", "evil.example", "/x\\y", " /x", "/a b", "", null, undefined]) {
    ok(safeNextPath(evil) === "/", `a link that could leave the site goes home instead (${JSON.stringify(evil)})`);
  }
  // What the browser would make of the ones that pass: always this site.
  for (const kept of ["/apps/x", "/%2F%2Fevil.example", "/%09/evil.example", "/q/1?next=//evil.example"]) {
    ok(new URL(safeNextPath(kept), "https://methodv.app").host === "methodv.app", `${kept} stays on methodv.app`);
  }
}

// Delete account: type your username to confirm.
ok(confirmMatches("ada_builds", "ada_builds") && confirmMatches(" @Ada_Builds ", "ada_builds"), "typing your username (with or without @, any case) confirms");
ok(!confirmMatches("ada", "ada_builds") && !confirmMatches("", "ada_builds") && !confirmMatches("", ""), "anything else doesn't");

// Security: browser notifications only go to real push services.
{
  const { isPushServiceEndpoint } = await import("../src/lib/push-core.ts");
  const good = ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/QK", "https://wns2-bl2p.notify.windows.com/w/?token=x"];
  const bad = ["http://fcm.googleapis.com/x", "https://169.254.169.254/latest", "https://fcm.googleapis.com.evil.com/x", "https://evil.com/fcm.googleapis.com", "https://user@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "javascript:alert(1)", 42];
  ok(good.every(isPushServiceEndpoint), "Chrome, Firefox, Safari and Edge push addresses are accepted");
  ok(!bad.some(isPushServiceEndpoint), `anything else is refused (${bad.filter(isPushServiceEndpoint).join(", ") || "none got through"})`);
}

// Security: V Coin balances are private, so the profile columns the site
// reads must match what the database lets anyone read (and never credits).
{
  const { PROFILE_COLUMNS } = await import("../src/lib/types.ts");
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(new URL("../supabase/migrations/20261011000000_security_hardening.sql", import.meta.url), "utf8");
  const granted = new Set(sql.match(/grant select \(([^)]*)\)/)![1].split(",").map((c) => c.trim()));
  const read = PROFILE_COLUMNS.split(",").map((c) => c.trim());
  ok(!granted.has("credits") && !read.includes("credits"), "nobody reads V Coin balances off profiles");
  ok(read.every((c) => granted.has(c)), `every profile column the site reads is readable (${read.filter((c) => !granted.has(c)).join(", ") || "all"})`);
}

// Tables linked more than one way (questions ↔ answers, apps ↔ profiles…)
// must name the link when embedded, or the live database refuses the read
// (the Q&A 404). Every embed of these in the website and app names it.
{
  const { readFileSync } = await import("node:fs");
  const files = ["../src/lib/data.ts", "../mobile/src/lib/data.ts", "../src/app/actions.ts"];
  const ambiguous = ["answers", "questions", "profiles", "challenges", "challenge_entries", "sponsorships", "package_deals", "swaps"];
  const unnamed: string[] = [];
  for (const f of files) {
    const code = readFileSync(new URL(f, import.meta.url), "utf8");
    for (const t of ambiguous) {
      // An embed looks like "answers(" or "alias:answers(" inside a select string, not ".from(" or a function call.
      for (const m of code.matchAll(new RegExp(`[\\s,(:\`"]${t}\\(`, "g"))) unnamed.push(`${f.replace("../", "")}: ${m[0].trim()}`);
    }
  }
  ok(unnamed.length === 0, `embeds of tables linked more than one way name their link (${unnamed.join("; ") || "all named"})`);
}

// Vercel never uploads mobile/ (.vercelignore), so nothing the website builds
// or type checks may import from it.
{
  const { readdirSync: ls, statSync } = await import("node:fs");
  const walk = (dir: string): string[] =>
    ls(dir).flatMap((f) => {
      const p = `${dir}/${f}`;
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mts|mjs)$/.test(f) ? [p] : [];
    });
  const root = new URL("..", import.meta.url).pathname;
  const offenders = [...walk(`${root}src`), ...walk(`${root}tests`), ...walk(`${root}scripts`)].filter((f) =>
    /from\s+["'][^"']*\/mobile\//.test(readFileSync(f, "utf8")),
  );
  ok(offenders.length === 0, `the website never imports from mobile/ (${offenders.map((f) => f.replace(root, "")).join(", ") || "none"})`);
}

// --- Database errors are logged (so empty pages have a reason in the logs) ---
{
  const base = "https://x.supabase.co";
  const err = (code: string) => JSON.stringify({ code, message: `boom ${code}`, details: null, hint: null });
  ok(describeDatabaseError("GET", `${base}/rest/v1/apps`, 304, "") === null, "a status below 400 isn't an error");
  const ambiguous = describeDatabaseError("GET", `${base}/rest/v1/questions?select=id,answers(id)&id=eq.1`, 400, err("PGRST201"));
  ok(ambiguous === "database error: GET /questions -> 400 PGRST201: boom PGRST201", `a broken query is logged by table and code (${ambiguous})`);
  ok(!ambiguous?.includes("select=") && !ambiguous?.includes("eq.1"), "the query itself (what people typed) isn't logged");
  ok(describeDatabaseError("POST", `${base}/rest/v1/rpc/my_credits`, 404, err("PGRST202"))?.includes("/rpc/my_credits -> 404 PGRST202") === true, "a missing function is logged");
  ok(describeDatabaseError("POST", `${base}/rest/v1/likes`, 409, err("23505")) === null, "a duplicate isn't logged");
  ok(describeDatabaseError("POST", `${base}/rest/v1/rpc/tip`, 400, err("P0001")) === null, "a friendly message from the database isn't logged");
  ok(describeDatabaseError("GET", `${base}/rest/v1/apps`, 406, err("PGRST116")) === null, "no row for .single() isn't logged");
  ok(describeDatabaseError("POST", `${base}/auth/v1/token`, 400, err("invalid_grant")) === null, "sign-in errors aren't logged here");
  ok(describeDatabaseError("GET", `${base}/rest/v1/apps`, 502, "<html>gateway</html>")?.endsWith("-> 502: <html>gateway</html>") === true, "a non-JSON error keeps its text");

  const realFetch = globalThis.fetch;
  const realError = console.error;
  const logged: string[] = [];
  console.error = (...args: unknown[]) => void logged.push(args.join(" "));
  globalThis.fetch = (async () => new Response(err("42501"), { status: 403 })) as typeof fetch;
  try {
    const res = await loggingFetch(`${base}/rest/v1/notification_settings?on_conflict=user_id`, { method: "POST" });
    ok(logged.length === 1 && logged[0].includes("POST /notification_settings -> 403 42501"), `loggingFetch logs a refused write (${logged[0]})`);
    ok((await res.json()).code === "42501", "the caller still gets the error body");
  } finally {
    globalThis.fetch = realFetch;
    console.error = realError;
  }
}

// --- The database's own messages reach people, in V Coin words ---
{
  const tooFast = { code: "P0001", message: "You're doing that too fast. Take a short break and try again." };
  ok(dbMessage(tooFast, "Couldn't post your question.") === tooFast.message, "the spam limit's message is shown as it is");
  ok(dbMessage({ code: "42501", message: "new row violates row-level security policy" }, "Couldn't post.") === "Couldn't post.", "other errors get the plain fallback");
  ok(dbMessage(null, "x") === "x" && dbMessage(undefined, "x") === "x", "no error, no message");
  ok(withVCoin("That costs 50 credits and you have 20.") === "That costs 50 V Coin and you have 20.", "older messages say V Coin");
  ok(withVCoin("The Spotlight costs 200 credits and you have 0.") === "The Spotlight costs 200 V Coin and you have 0." && withVCoin("Pick a credit pack.") === "Pick a V Coin pack.", "the Spotlight and pack messages too");
  ok(dbMessage({ code: "P0001", message: "That costs 50 credits and you have 20." }, "x") === "That costs 50 V Coin and you have 20.", "and they're reworded on the way out");
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
