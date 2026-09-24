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
ok(await page.getByText("Builders like you").isVisible(), "Home suggests builders to follow");
ok(await page.getByText("In common: Design · React").isVisible(), "suggestions say what you have in common");
ok((await page.getByText("All projects").count()) === 0, "Home leaves the full list to Browse");
ok(await page.getByText("Just posted").isVisible(), "Home shows the newest projects under the suggestions");
{
  const y = async (text) => (await page.getByText(text, { exact: false }).first().boundingBox())?.y ?? -1;
  const [posted, builders, testers] = [await y("Just posted"), await y("Top builders ·"), await y("Top testers ·")];
  ok(posted < builders && builders < testers, "Home ends with Top builders, then Top testers");
  ok(await page.getByRole("link", { name: /^1\. June Okafor/ }).first().isVisible(), "the top builder leads the board");
  await page.getByText("Top builders ·", { exact: false }).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}home-leaderboards.png` });
}
{
  const y = async (text) => (await page.getByText(text, { exact: true }).first().boundingBox()).y;
  ok((await y("Featured")) < (await y("Builders like you")) && (await y("Builders like you")) < (await y("Just posted")), "Home order: Featured, Builders like you, Just posted");
}
ok(await page.getByText(/Demo mode/).isVisible(), "demo mode is labeled");
for (const tab of ["Home", "Drops", "Browse", "Me"]) ok((await page.getByRole("tab", { name: tab }).count()) > 0, `tab bar has ${tab}`);
ok((await page.getByRole("tab", { name: "Post a Drop" }).count()) > 0, "tab bar has the + button");
await page.getByRole("button", { name: "Follow @june_designs" }).click();
await page.waitForURL(/sign-in/);
ok(true, "Follow while signed out goes to sign-in");

await visit("/drops", "drops");
ok((await page.getByText("Try it →").count()) > 0, "Drops feed shows Try it");
ok((await page.getByText("Sponsored").count()) > 0, "sponsored Drops are labeled");
{
  // For you: watching a Drop for a few seconds is remembered on the device…
  await page.evaluate(() => localStorage.removeItem("method-v-interests"));
  await visit("/drops");
  await page.waitForTimeout(4600);
  const saved = await page.evaluate(() => localStorage.getItem("method-v-interests"));
  ok(/^[a-z_]+:1$/.test(saved ?? ""), `watching a Drop saves an interest (${saved})`);
  // …and what someone's into comes first.
  const topFor = async (interests) => {
    await page.evaluate((v) => localStorage.setItem("method-v-interests", v), interests);
    await visit("/drops");
    const ys = {};
    for (const name of ["NoteFlow", "QuizPop", "PalettePal", "Splitsy"]) {
      ys[name] = (await page.getByRole("link", { name, exact: true }).first().boundingBox())?.y ?? Infinity;
    }
    return Object.entries(ys).sort((a, b) => a[1] - b[1])[0][0];
  };
  ok((await topFor("finance:20")) === "Splitsy", "into finance: Splitsy's Drop comes first");
  ok((await topFor("education:20")) === "QuizPop", "into education: QuizPop's Drop comes first");
  await page.evaluate(() => localStorage.removeItem("method-v-interests"));
}

// Questions: the switch at the top of Drops, polls, and a thread.
await visit("/drops");
await page.getByRole("tab", { name: "Questions" }).click();
await page.getByText("Which export should I add next?").waitFor({ timeout: 10000 });
ok(true, "Drops switches to Questions");
ok((await page.getByText("Builder asks").count()) >= 1, "builders asking about their own app are labeled");
ok(await page.getByText("49 votes · tap to vote and see results").isVisible(), "polls show their choices and total");
await page.screenshot({ path: `${OUT}questions.png` });
await page.getByRole("button", { name: "Answer →" }).first().click();
await page.waitForURL(/\/q\//);
await page.getByText("Tailwind config, easy.", { exact: false }).first().waitFor({ timeout: 10000 });
ok(await page.getByText("Same, and CSS variables would cover everyone else.").isVisible(), "the thread shows answers and replies");
ok(await page.getByRole("button", { name: "Upvote, 9" }).isVisible(), "the question has an upvote button with its count");
ok((await page.getByRole("button", { name: /^Upvote, \d+$/ }).count()) === 3, "so does every answer and reply");
await page.screenshot({ path: `${OUT}question-thread.png` });
await page.getByRole("button", { name: "Upvote, 5" }).click();
await page.waitForURL(/sign-in/);
ok(true, "upvoting while signed out asks you to sign in");

// Asking: from the Questions feed, an app's page, and the Post tab.
await visit("/drops");
await page.getByRole("tab", { name: "Questions" }).click();
await page.getByRole("button", { name: "Ask a question" }).first().click();
await page.waitForURL(/\/ask/);
await page.getByLabel("Your question").waitFor({ timeout: 10000 });
ok(true, "Questions has an Ask button that opens the Ask screen");
ok((await page.getByRole("radio").count()) >= 1, "you pick which app it's about");
await page.getByLabel("Your question").fill("Which logo is better?");
await page.getByText("+ Add a poll").click();
ok(await page.getByRole("textbox", { name: "Choice 1", exact: true }).isVisible() && (await page.getByRole("textbox", { name: "Choice 2", exact: true }).isVisible()), "+ Add a poll gives two choices");
await page.getByText("+ Add a choice").click();
ok(await page.getByRole("textbox", { name: "Choice 3", exact: true }).isVisible(), "…and you can add more");
await page.getByRole("textbox", { name: "Choice 1", exact: true }).fill("Blue");
await page.getByRole("textbox", { name: "Choice 2", exact: true }).fill("Mint");
await page.getByRole("button", { name: "Ask" }).click();
await page.waitForFunction(() => document.body.innerText.split("This is a demo build").length > 2, null, { timeout: 10000 });
ok(true, "asking explains the demo build");
await page.screenshot({ path: `${OUT}ask.png` });
await visit("/apps/noteflow");
await page.getByText("Does it work with Google Meet recordings, or only Zoom?").waitFor({ timeout: 10000 });
ok(await page.getByRole("button", { name: "Ask a question" }).isVisible(), "app pages list their questions with an Ask button");
await visit("/post");
ok(await page.getByText("Or ask a question about your app →").isVisible(), "the Post tab links to Ask");

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
ok((await page.getByText("Open to collab", { exact: true }).count()) === 1, "status shows once, as the badge by the photo");
ok(await page.getByText("Founder", { exact: true }).isVisible(), "other role tags still show");
await visit("/u/june_designs");
ok(await page.getByRole("link", { name: "Instagram @june.designs" }).isVisible(), "profile shows social handles under the name");
await visit("/u/marco_ships");
ok(await page.getByText("Looking for work", { exact: true }).first().isVisible(), "Marco's status badge");
await visit("/drops");
ok((await page.getByText(/^(Hiring|Looking for work|Open to collab|Freelancer)$/).count()) >= 1, "Drops show the builder's status by their avatar");

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
