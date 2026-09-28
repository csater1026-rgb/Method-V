// Visits every page on the site (demo mode), following every link it finds,
// the way a curious first visitor would. For each page it checks:
//   - it loads (no 404 or 500), and so does everything it pulls in;
//   - no errors in the browser console;
//   - nothing scrolls sideways on a phone or a laptop;
//   - links to a spot on a page (#sponsor, #grow, ...) land on something.
// Links that leave the site (Try it, sponsor links) are checked without
// following them off-site. Start the app first, then run:
//
//   npm run build && npm start      # in one terminal
//   npm run test:crawl              # in another
//
// BASE_URL defaults to http://localhost:3000. Set CHROMIUM_PATH to use an
// installed Chromium instead of Playwright's download.

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const origin = new URL(BASE).origin;
const MAX_PAGES = 400;

// Every page without a [placeholder] in its path; the others are found
// through links (demo apps, people, questions, challenges, brands).
const SEEDS = [
  "/", "/login", "/terms", "/privacy", "/offline", "/app", "/agree", "/drops", "/drops?tab=questions", "/browse", "/test",
  "/earn", "/pro", "/credits", "/challenges", "/swaps", "/brands", "/brands/new", "/submit", "/ask", "/settings", "/inbox",
  "/dashboard", "/developers", "/setup/emails", "/setup/push-keys",
];
// Routes that answer with a redirect or a file rather than a page.
const NOT_PAGES = /^\/(try|go)\/|^\/(api|auth)\/|^\/dashboard\/export|^\/(embed|badge)\//;

let failures = 0;
const problems = [];
const bad = (msg) => {
  problems.push(msg);
  failures++;
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
const laptop = await browser.newContext({ viewport: { width: 1280, height: 800 } });

const normalize = (href, from) => {
  let url;
  try {
    url = new URL(href, from);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  return url;
};

const seen = new Set();
const queue = SEEDS.map((p) => ({ path: p, from: "(start)" }));
const others = new Map(); // non-page routes -> first page linking there
const anchors = []; // { path, id, from }
let visited = 0;

async function visit(context, path, collect) {
  const page = await context.newPage();
  const errors = [];
  const broken = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.origin === origin && r.status() >= 400 && u.pathname + u.search !== path) broken.push(`${r.status()} ${u.pathname}`);
  });
  let status = 0;
  try {
    const res = await page.goto(BASE + path, { waitUntil: "load" });
    status = res?.status() ?? 0;
    // Wait for loading screens to be replaced by the page itself.
    await page.waitForFunction(() => !document.querySelector('[role="status"][aria-live="polite"] svg, [role="status"] canvas'), null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(150);
  } catch (e) {
    errors.push(`couldn't load: ${e.message.split("\n")[0]}`);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => 0);
  let links = [];
  if (collect) {
    links = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href"))).catch(() => []);
  }
  await page.close();
  return { status, errors, broken, overflow, links };
}

async function idExists(path, id) {
  const page = await phone.newPage();
  try {
    await page.goto(BASE + path, { waitUntil: "load" });
    await page.waitForTimeout(100);
    return await page.evaluate((x) => !!document.getElementById(x), id);
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

while (queue.length && visited < MAX_PAGES) {
  const { path, from } = queue.shift();
  if (seen.has(path)) continue;
  seen.add(path);
  visited++;
  const { status, errors, broken, overflow, links } = await visit(phone, path, true);
  if (status >= 400) bad(`${path} answered ${status} (linked from ${from})`);
  for (const e of new Set(errors)) bad(`${path}: console error: ${e.slice(0, 200)}`);
  for (const b of new Set(broken)) bad(`${path}: a file it loads is broken: ${b}`);
  if (overflow > 0) bad(`${path}: scrolls sideways on a phone (${overflow}px)`);
  const wide = await visit(laptop, path, false);
  if (wide.overflow > 0) bad(`${path}: scrolls sideways on a laptop (${wide.overflow}px)`);

  for (const href of links) {
    if (!href || /^(mailto|tel|sms|javascript):/i.test(href)) continue;
    const url = normalize(href, BASE + path);
    if (!url) continue;
    const target = url.pathname + url.search;
    if (url.hash.length > 1) anchors.push({ path: href.startsWith("#") ? path : target, id: decodeURIComponent(url.hash.slice(1)), from: path });
    if (NOT_PAGES.test(url.pathname)) {
      if (!others.has(target)) others.set(target, path);
      continue;
    }
    if (!seen.has(target)) queue.push({ path: target, from: path });
  }
}

// Redirects and files: they must answer, but aren't followed off-site.
for (const [target, from] of others) {
  const res = await fetch(BASE + target, { redirect: "manual" }).catch((e) => ({ status: 0, error: e.message }));
  if (res.status === 0 || res.status >= 400) bad(`${target} answered ${res.status} (linked from ${from})`);
}

// Links to a spot on a page.
const checkedAnchors = new Set();
for (const a of anchors) {
  const key = `${a.path}#${a.id}`;
  if (checkedAnchors.has(key)) continue;
  checkedAnchors.add(key);
  if (!(await idExists(a.path, a.id))) bad(`${a.from} links to ${key}, but there's no #${a.id} there`);
}

// The picture link previews show (texts, X, Slack): declared on the welcome
// page, which is all a signed-out preview bot sees, and it loads.
const welcome = await (await fetch(`${BASE}/login`)).text();
const shareImage = welcome.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
if (!shareImage) bad("the welcome page has no share picture (og:image)");
else {
  const u = new URL(shareImage);
  const res = await fetch(BASE + u.pathname + u.search);
  if (res.status !== 200 || !res.headers.get("content-type")?.startsWith("image/")) bad(`the share picture ${u.pathname} answered ${res.status}`);
}

// A shared app link's preview card (what texts, X and Slack get for
// /apps/<name>): the app's name and a picture.
const firstApp = [...seen].find((p) => /^\/apps\/[a-z0-9-]+$/.test(p));
if (firstApp) {
  const res = await fetch(`${BASE}/preview${firstApp}`);
  const card = await res.text();
  const title = card.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
  const image = card.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  if (res.status !== 200 || !title?.endsWith("on Method V") || !image) bad(`the preview card for ${firstApp} is missing its title or picture (${res.status})`);
  if (res.headers.get("cache-control") !== "private, no-store") bad("the preview card could be cached for people too");
} else bad("no app pages found to check the preview card");

await browser.close();

console.log(`visited ${visited} pages (phone and laptop), ${others.size} redirects and files, ${checkedAnchors.size} links to spots on pages`);
if (queue.length && visited >= MAX_PAGES) console.log(`stopped at ${MAX_PAGES} pages; ${queue.length} links left unvisited`);
for (const p of problems) console.log(`FAIL ${p}`);
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
