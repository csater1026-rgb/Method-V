// Clicks through the site in Chromium in demo mode (no Supabase keys set) at
// phone and desktop sizes. Start the app first, then run:
//
//   npm run build && npm start      # in one terminal
//   npm run test:ui                 # in another
//
// BASE_URL defaults to http://localhost:3000. Set CHROMIUM_PATH to use an
// installed Chromium instead of Playwright's download. Screenshots land in
// tests/.shots/.

import { mkdirSync } from "node:fs";

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = new URL("./.shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const CLIPS = new URL("./fixtures/", import.meta.url).pathname;

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) failures++;
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

async function run(name, viewport, fn) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await fn(page);
  ok(errors.length === 0, `${name}: no console errors${errors.length ? ` (${errors.join(" | ")})` : ""}`);
  await ctx.close();
}

async function noSideScroll(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(overflow <= 0, `${label}: no horizontal scroll (overflow ${overflow}px)`);
}

const phone = { width: 390, height: 844 };
const desktop = { width: 1280, height: 860 };

await run("home (phone)", phone, async (page) => {
  await page.goto(BASE + "/");
  const tabs = page.getByRole("navigation", { name: "Main" });
  ok((await tabs.getByRole("link").first().textContent()) === "Home", "first tab is Home");
  ok((await tabs.getByRole("link", { name: "Home" }).getAttribute("aria-current")) === "page", "Home tab is active");
  const featured = page.getByRole("region", { name: "Featured apps" });
  ok((await featured.locator("article").count()) === 4, "Featured row: 2 picked apps, then launch day and boosted");
  ok((await featured.locator("article").first().getAttribute("class")).includes("snap-start"), "Featured row swipes sideways");
  ok(await page.getByText("2 apps need testers.").isVisible(), "needs-testers strip links to Test & earn");
  ok((await page.locator("#projects article").count()) === 4, "All projects lists everyone's apps");
  await noSideScroll(page, "home");
  await page.screenshot({ path: OUT + "home-phone.png", fullPage: true });
  await page.getByRole("link", { name: "Search apps" }).click();
  await page.waitForURL(/\/browse/);
  ok(true, "search button opens Browse");
});

await run("home sort + category", desktop, async (page) => {
  await page.goto(BASE + "/?sort=popular");
  const names = await page.locator("#projects article a.display").allTextContents();
  ok(names[0] === "PalettePal", `Popular sorts by tries (${names.join(",")})`);
  await page.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: "Finance" }).click();
  await page.waitForURL(/category=finance/);
  ok((await page.locator("#projects article").count()) === 1, "category filter narrows All projects");
  ok(page.url().includes("sort=popular"), "category keeps the sort");
  await page.goto(BASE + "/");
  await page.screenshot({ path: OUT + "home-desktop.png", fullPage: true });
});

await run("feed (phone)", phone, async (page) => {
  await page.goto(BASE + "/drops");
  ok((await page.locator("article").count()) === 4, "feed shows 4 sample Drops");
  ok(await page.getByText("Demo mode · sample apps").isVisible(), "demo banner visible");
  const feed = page.getByTestId("drop-feed");
  const box = await feed.boundingBox();
  const tabs = await page.getByRole("navigation", { name: "Main" }).boundingBox();
  const bottomGap = tabs.y - (box.y + box.height);
  ok(Math.abs(bottomGap) <= 1, `feed fills the space above the tab bar (gap ${bottomGap}px)`);
  const tryLink = page.locator("article").first().getByRole("link", { name: "Try it →" });
  ok((await tryLink.getAttribute("href")) === "/try/noteflow", "Try it links to /try/<slug>");
  await noSideScroll(page, "feed");
  await page.screenshot({ path: OUT + "feed-phone.png" });

  // Snap scrolling moves one Drop at a time.
  await feed.evaluate((el) => el.scrollBy(0, el.clientHeight));
  await page.waitForTimeout(400);
  const second = await page.locator("article").nth(1).boundingBox();
  ok(Math.abs(second.y - box.y) < 2, "scrolling snaps to the next Drop");

  // Liking while signed out goes to sign-in.
  await page.locator("article").nth(1).getByRole("button", { name: "Like" }).click();
  await page.waitForURL(/\/login\?next=/);
  ok(page.url().includes("/login?next=%2Fdrops"), "like while signed out → sign in");
});

// Themes: follows the phone, the toggle switches and remembers, media stays dark.
{
  const bgOf = (page, sel = "body") => page.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
  const ctx = await browser.newContext({ viewport: phone, colorScheme: "light" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/");
  ok((await bgOf(page)) === "rgb(243, 238, 226)", "light phone setting → cream background");
  const featuredBg = await bgOf(page, "[aria-label='Featured apps'] article [class*='@container']");
  ok(featuredBg === "rgb(25, 33, 27)", `featured poster stays dark in light mode (${featuredBg})`);
  await page.getByRole("button", { name: "Switch between light and dark" }).click();
  ok((await page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "toggle switches to dark");
  ok((await bgOf(page)) === "rgb(18, 24, 20)", "dark background after toggle");
  await page.reload();
  ok((await bgOf(page)) === "rgb(18, 24, 20)", "choice is remembered after reload");
  await page.waitForTimeout(1200); // let the entrance animation finish
  await page.screenshot({ path: OUT + "home-dark-phone.png" });
  await page.getByRole("button", { name: "Switch between light and dark" }).click();
  await page.reload();
  ok((await bgOf(page)) === "rgb(243, 238, 226)", "toggle back to light is remembered");
  await page.waitForTimeout(1200); // let the entrance animation finish
  await page.screenshot({ path: OUT + "home-light-phone.png" });
  await page.goto(BASE + "/drops");
  await page.waitForTimeout(1200); // let the entrance animation finish
  await page.screenshot({ path: OUT + "feed-light-phone.png" });
  await page.goto(BASE + "/apps/noteflow");
  await page.screenshot({ path: OUT + "app-light-phone.png", fullPage: true });
  await ctx.close();
}

await run("small phone", { width: 360, height: 740 }, async (page) => {
  for (const path of ["/", "/drops", "/browse", "/apps/noteflow", "/u/ada_builds", "/submit", "/login", "/test", "/credits"]) {
    await page.goto(BASE + path);
    await noSideScroll(page, `360px ${path}`);
  }
});

await run("feed tabs + category", desktop, async (page) => {
  await page.goto(BASE + "/drops?tab=trending");
  const first = await page.locator("article").first().getAttribute("aria-label");
  ok(first === "PalettePal Drop", `trending puts most-liked first (${first})`);
  await page.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: "Education" }).click();
  await page.waitForURL(/category=education/);
  ok((await page.locator("article").count()) === 1, "category filter narrows the feed");
  ok(page.url().includes("tab=trending"), "category keeps the tab");
  await page.goto(BASE + "/drops?tab=following");
  ok(await page.getByText("Follow builders you like").isVisible(), "following tab asks you to sign in");
  await page.goto(BASE + "/drops");
  await page.screenshot({ path: OUT + "feed-desktop.png" });
});

await run("browse", desktop, async (page) => {
  await page.goto(BASE + "/browse");
  ok((await page.locator("main article").count()) === 4, "browse shows 4 apps");
  await page.getByLabel("Search apps").fill("palette");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForURL(/q=palette/);
  ok((await page.locator("main article").count()) === 1, "search finds PalettePal");
  await page.goto(BASE + "/browse?stack=supabase&sort=tried");
  const names = await page.locator("main article a.display").allTextContents();
  ok(names.join(",") === "NoteFlow,QuizPop", `stack filter + most tried sort (${names.join(",")})`);
  await page.goto(BASE + "/browse?category=finance&stage=idea");
  ok((await page.locator("main article").count()) === 1, "category + stage filter");
  await page.goto(BASE + "/browse");
  await page.screenshot({ path: OUT + "browse-desktop.png", fullPage: true });
});

await run("browse (phone)", phone, async (page) => {
  await page.goto(BASE + "/browse");
  await noSideScroll(page, "browse phone");
  await page.screenshot({ path: OUT + "browse-phone.png", fullPage: true });
});

await run("app page", desktop, async (page) => {
  await page.goto(BASE + "/apps/noteflow");
  ok(await page.getByRole("heading", { name: "NoteFlow", exact: true }).isVisible(), "app heading");
  ok((await page.locator("#comments li").count()) === 2, "sample comments listed");
  ok(await page.getByText("Sign in to comment").isVisible() || (await page.getByRole("link", { name: "Sign in" }).count()) > 0, "comment asks to sign in");
  ok(await page.getByRole("link", { name: "Next.js" }).isVisible(), "tech stack chips link to browse");
  await page.screenshot({ path: OUT + "app-desktop.png", fullPage: true });
});

await run("app page (phone)", phone, async (page) => {
  await page.goto(BASE + "/apps/palettepal");
  await noSideScroll(page, "app phone");
  await page.screenshot({ path: OUT + "app-phone.png", fullPage: true });
});

await run("profile", desktop, async (page) => {
  await page.goto(BASE + "/u/ada_builds");
  ok(await page.getByRole("heading", { name: "Ada Park" }).isVisible(), "profile heading");
  ok(await page.getByText("Open to collab").isVisible(), "role tags shown");
  ok((await page.locator("main article").count()) === 2, "profile lists their 2 apps");
  await page.screenshot({ path: OUT + "profile-desktop.png", fullPage: true });
});

{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const res = await page.goto(BASE + "/u/nobody_here");
  ok(res.status() === 404, "unknown profile is 404");
  await ctx.close();
}

await run("launch days + boosts", desktop, async (page) => {
  await page.goto(BASE + "/");
  const featured = page.getByRole("region", { name: "Featured apps" });
  const labels = await featured.locator("article .tag-accent").allTextContents();
  ok(labels.some((l) => l.startsWith("Launch day")) && labels.some((l) => l.startsWith("Boosted")), `Featured row includes launch-day and boosted apps (${labels.join(" | ")})`);
  const soon = page.getByRole("region", { name: "Upcoming launches" });
  ok((await soon.locator("li").count()) === 1 && (await soon.textContent()).includes("QuizPop"), "Launching soon lists QuizPop");
  ok(/2d [34]h/.test(await soon.locator("time").textContent()), `countdown shows days and hours (${await soon.locator("time").textContent()})`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: OUT + "home-launches.png", fullPage: true });

  await page.goto(BASE + "/apps/quizpop");
  ok(await page.getByText(/^Launching in/).first().isVisible(), "app page shows the launch countdown");
  ok(await page.locator(".tag-accent", { hasText: "Boosted" }).isVisible(), "app page shows Boosted");
  const grow = page.getByRole("region", { name: "Grow" });
  ok(await grow.getByText("Builder tools · preview in demo mode").isVisible(), "Grow panel preview in demo mode");
  await grow.getByRole("button", { name: /3 days/ }).click();
  await grow.getByText("Method V is running in demo mode").waitFor({ timeout: 5000 });
  ok(true, "boost button explains demo mode");
  await grow.screenshot({ path: OUT + "grow-panel.png" });

  await page.goto(BASE + "/apps/splitsy");
  ok(await page.getByRole("region", { name: "Grow" }).getByText("It's launch day!").isVisible(), "launch-day state on the app page");
  await page.goto(BASE + "/apps/noteflow");
  ok(await page.getByRole("region", { name: "Grow" }).getByLabel("Launch date and time").isVisible(), "unscheduled app offers a launch date picker");
});

await run("build in public", desktop, async (page) => {
  await page.goto(BASE + "/");
  const home = page.getByRole("region", { name: "Build in public" });
  ok((await home.locator("li").count()) === 4, "Home shows everyone's latest updates");
  ok(!(await home.getByLabel("Write an update").count()), "no composer when signed out");
  await page.goto(BASE + "/apps/noteflow");
  const appUpdates = page.getByRole("region", { name: "Updates" });
  ok((await appUpdates.locator("li").count()) === 1 && (await appUpdates.textContent()).includes("Google Meet"), "app page shows that app's updates");
  await page.goto(BASE + "/u/ada_builds");
  ok((await page.getByRole("region", { name: "Updates" }).locator("li").count()) === 2, "profile shows the builder's updates");
});

{
  const res = await fetch(BASE + "/badge/noteflow");
  const svg = await res.text();
  ok(res.headers.get("content-type").startsWith("image/svg+xml") && svg.includes("METHOD V") && svg.includes("412 tries"), "badge is an SVG with the app's tries");
  ok((await fetch(BASE + "/badge/nope")).status === 404, "badge for an unknown app is 404");
  ok((await (await fetch(BASE + "/badge/noteflow?theme=light")).text()).includes("#fbf8f1"), "light badge");
}

await run("share kit", desktop, async (page) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(BASE + "/apps/noteflow");
  const grow = page.getByRole("region", { name: "Grow" });
  const badge = grow.getByRole("img", { name: "Try NoteFlow on Method V" });
  await badge.scrollIntoViewIfNeeded();
  ok(await badge.evaluate((img) => img.complete && img.naturalWidth > 0), "badge preview loads");
  await grow.getByRole("button", { name: "Copy Markdown" }).click();
  const md = await page.evaluate(() => navigator.clipboard.readText());
  ok(md.startsWith("[![Try NoteFlow on Method V](http") && md.endsWith("/apps/noteflow)"), `Markdown snippet links to the app page (${md})`);
  ok((await grow.getByRole("link", { name: "Post on X" }).getAttribute("href")).startsWith("https://x.com/intent/post?text=NoteFlow"), "Post on X is prefilled");
  await grow.screenshot({ path: OUT + "share-kit.png" });
});

await run("swaps", desktop, async (page) => {
  await page.goto(BASE + "/apps/noteflow");
  const friends = page.getByRole("region", { name: "Friends of this app" });
  ok((await friends.textContent()).includes("PalettePal"), "NoteFlow shows its swap partner PalettePal");
  await page.goto(BASE + "/apps/palettepal");
  ok((await page.getByRole("region", { name: "Friends of this app" }).textContent()).includes("NoteFlow"), "…and PalettePal shows NoteFlow");
  await page.goto(BASE + "/apps/quizpop");
  ok((await page.getByRole("region", { name: "Friends of this app" }).count()) === 0, "no Friends section without swaps");
  await page.goto(BASE + "/swaps");
  ok(await page.getByText("Swaps are off in demo mode.").isVisible(), "swaps page explains demo mode");
});

await run("tester passport", desktop, async (page) => {
  await page.goto(BASE + "/u/marco_ships");
  const passport = page.getByRole("region", { name: "Tester Passport" });
  ok(await passport.getByRole("heading", { name: "Pro Tester" }).isVisible(), "41 feedback + 17 helpful = Pro Tester");
  ok(await passport.getByText("Next: Trusted Tester").isVisible(), "shows the next rank");
  ok((await passport.locator("li.border-accent").count()) === 8, "8 of 10 category stamps filled");
  await passport.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await passport.screenshot({ path: OUT + "passport.png" });
  await page.goto(BASE + "/test");
  const top = page.getByRole("region", { name: "Top testers" });
  ok((await top.locator("li").count()) === 3, "top testers board lists testers");
  ok((await top.locator("li").first().textContent()).includes("Marco"), "most helpful tester is first");
});

await run("login", phone, async (page) => {
  await page.goto(BASE + "/login");
  ok(await page.getByRole("button", { name: "Email me a sign-in link" }).isDisabled(), "sign-in disabled in demo mode");
  await noSideScroll(page, "login");
});

await run("submit", desktop, async (page) => {
  await page.goto(BASE + "/submit");
  const input = page.getByLabel("Drop video");
  await input.setInputFiles(CLIPS + "clip-62s.webm");
  await page.getByText(/Drops can be up to 60 seconds/).waitFor({ timeout: 15000 });
  ok(true, "62-second video is rejected");
  await input.setInputFiles(CLIPS + "clip-20s.webm");
  await page.getByText(/^0:20 ·/).waitFor({ timeout: 15000 });
  ok(true, "20-second video is accepted and shows 0:20");
  await page.getByLabel("App name").fill("Test");
  await page.getByLabel(/Tagline/).fill("Testing");
  await page.getByRole("textbox", { name: /Link to your live app/ }).fill("https://example.com");
  await page.getByLabel("Category").selectOption("ai");
  await page.getByRole("button", { name: "Post Drop" }).click();
  ok(await page.getByText("Method V is running in demo mode").isVisible(), "posting explains demo mode");
  await page.screenshot({ path: OUT + "submit-desktop.png", fullPage: true });
});

await run("test & earn", desktop, async (page) => {
  await page.goto(BASE + "/test");
  ok(await page.getByRole("heading", { name: "Test & earn" }).isVisible(), "Test & earn page loads");
  ok((await page.locator("main article").count()) === 2, "queue shows the 2 sample apps waiting for testers");
  ok(await page.getByText("4 spots left").isVisible(), "shows spots left");
  await page.getByRole("link", { name: "Test it →" }).first().click();
  await page.waitForURL(/\/apps\/.+#feedback/);
  ok(await page.locator("#feedback").getByText("off in demo mode").isVisible(), "feedback panel explains demo mode");
  await page.screenshot({ path: OUT + "test-desktop.png", fullPage: true });
});

await run("app stats", desktop, async (page) => {
  await page.goto(BASE + "/apps/palettepal");
  ok(await page.getByText("87%").isVisible(), "shows % who would use it (27 of 31)");
  ok(await page.getByText("4.6★").isVisible(), "shows average rating (142 / 31)");
  await page.goto(BASE + "/apps/splitsy");
  ok(await page.getByText("No feedback yet").first().isVisible(), "no-feedback state");
});

await run("test & earn (phone)", phone, async (page) => {
  await page.goto(BASE + "/test");
  await noSideScroll(page, "test phone");
  const tabs = page.getByRole("navigation", { name: "Main" });
  ok(await tabs.isVisible(), "bottom tab bar on phones");
  ok((await tabs.getByRole("link", { name: "Test" }).getAttribute("aria-current")) === "page", "Test tab is active");
  await page.screenshot({ path: OUT + "test-phone.png", fullPage: true });
});

await run("credits", phone, async (page) => {
  await page.goto(BASE + "/credits");
  ok(await page.getByText("How credits work").isVisible(), "credits page explains the rules");
});

await run("submit (phone)", phone, async (page) => {
  await page.goto(BASE + "/submit");
  await noSideScroll(page, "submit phone");
  await page.screenshot({ path: OUT + "submit-phone.png", fullPage: true });
});

await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
