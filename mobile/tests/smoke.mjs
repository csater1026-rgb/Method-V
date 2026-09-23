// Clicks through the app's web build in Chromium at phone size (demo mode),
// as a stand-in for a simulator: every screen renders, key flows respond, no
// errors. Native-only pieces (camera, Apple sign-in, video playback) need a
// device or simulator.
//
//   npx expo export --platform web --output-dir dist-web
//   node tests/smoke.mjs        (uses the website's Playwright install)

import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

import { chromium } from "../../node_modules/playwright/index.mjs";

const DIST = new URL("../dist-web/", import.meta.url).pathname;
const OUT = new URL("./.shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".ttf": "font/ttf", ".json": "application/json", ".ico": "image/x-icon" };

// Static server with a single-page-app fallback.
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = join(DIST, path);
  const target = existsSync(file) && extname(file) ? file : join(DIST, "index.html");
  res.writeHead(200, { "Content-Type": TYPES[extname(target)] ?? "application/octet-stream" });
  res.end(readFileSync(target));
}).listen(3200);
const BASE = "http://localhost:3200";

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) failures++;
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "dark" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

async function visit(path, shot) {
  await page.goto(BASE + path);
  await page.waitForTimeout(1200);
  if (shot) await page.screenshot({ path: `${OUT}${shot}.png` });
}

await visit("/", "home");
ok(await page.getByText("Featured", { exact: true }).isVisible(), "Home shows Featured");
ok((await page.getByText("NoteFlow").count()) > 0, "Home lists the sample apps");
ok(await page.getByText(/Demo mode/).isVisible(), "demo mode is labeled");
for (const tab of ["Home", "Drops", "Browse", "Me"]) ok((await page.getByRole("tab", { name: tab }).count()) > 0, `tab bar has ${tab}`);
ok((await page.getByRole("tab", { name: "Post a Drop" }).count()) > 0, "tab bar has the + button");

await visit("/drops", "drops");
ok((await page.getByText("Try it →").count()) > 0, "Drops feed shows Try it");
ok((await page.getByText("Sponsored").count()) > 0, "sponsored Drops are labeled");

await visit("/browse", "browse");
await page.getByRole("button", { name: "Education" }).click();
await page.waitForTimeout(400);
ok((await page.getByText("QuizPop").count()) > 0 && (await page.getByText("NoteFlow").count()) === 0, "Browse filters by category");

await visit("/apps/quizpop", "app");
ok(await page.getByText("Sponsored · Boost Exchange").isVisible(), "app page shows its sponsor, labeled");
ok(await page.getByText("Turn any lesson into a 5-question quiz in seconds").first().isVisible(), "app page shows the tagline");
ok(await page.getByText("Comments").first().isVisible(), "app page has comments");

await visit("/u/ada_builds", "profile");
ok(await page.getByText("Pro", { exact: true }).isVisible(), "Pro badge on a Pro profile");

await visit("/post", "post");
ok(await page.getByRole("button", { name: "Record" }).isVisible(), "Post offers Record");
ok(await page.getByText(/Still need: a video/).isVisible(), "Post says what's missing");

await visit("/sign-in", "sign-in");
ok(await page.getByLabel("Email").isVisible() && (await page.getByLabel("Password", { exact: true }).isVisible()), "sign-in has email and password");
await page.getByRole("tab", { name: "Create account" }).click();
ok(await page.getByText("Join Method V").isVisible(), "switches to Create account");
await page.getByLabel("Email").fill("ada@example.com");
await page.getByLabel("Password", { exact: true }).fill("correct horse");
await page.getByRole("button", { name: "Create account" }).click();
await page.waitForTimeout(300);
ok(await page.getByText(/demo build/).last().isVisible(), "creating an account explains demo mode");
await page.getByText("Forgot your password? Email me a code").click();
ok(await page.getByRole("button", { name: "Email me a code" }).isVisible(), "forgot password switches to an emailed code");
await page.screenshot({ path: `${OUT}sign-in-code.png` });

await visit("/me", "me");
ok(await page.getByText("See a sample profile").isVisible(), "Me explains demo mode");

// Light mode renders too.
await page.emulateMedia({ colorScheme: "light" });
await visit("/", "home-light");

ok(errors.length === 0, `no console errors${errors.length ? ` (${errors.slice(0, 3).join(" | ")})` : ""}`);
await browser.close();
server.close();
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
