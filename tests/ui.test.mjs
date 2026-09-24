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

// Open a page and wait until its content has replaced any loading screen
// (Drops, Browse and Test & earn stream in behind the pixel coder).
async function go(page, path) {
  const res = await page.goto(BASE + path);
  await page.waitForFunction(() => !document.querySelector('[role="status"]'));
  return res;
}

async function noSideScroll(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(overflow <= 0, `${label}: no horizontal scroll (overflow ${overflow}px)`);
}

const phone = { width: 390, height: 844 };
const desktop = { width: 1280, height: 860 };

await run("home (phone)", phone, async (page) => {
  await go(page, "/");
  const tabs = page.getByRole("navigation", { name: "Main" });
  ok((await tabs.getByRole("link").first().textContent()) === "Home", "first tab is Home");
  ok((await tabs.getByRole("link", { name: "Home" }).getAttribute("aria-current")) === "page", "Home tab is active");
  const featured = page.getByRole("region", { name: "Featured apps" });
  ok((await featured.locator("article").count()) === 4, "Featured row: 2 picked apps, then launch day and boosted");
  ok((await featured.locator("article").first().getAttribute("class")).includes("snap-start"), "Featured row swipes sideways");
  ok(await page.getByRole("region", { name: "Builders like you" }).isVisible(), "Home shows builders to follow");
  const justPosted = page.getByRole("region", { name: "Just posted" });
  const newest = await justPosted.locator("article a.font-semibold").allTextContents();
  ok(newest.length === 4 && newest[0] === "NoteFlow", `Just posted lists the newest projects first (${newest.join(",")})`);
  ok((await justPosted.locator("article").first().getAttribute("class")).includes("snap-start"), "Just posted swipes sideways too");
  ok((await justPosted.locator("article .tag-accent").count()) === 0, "Just posted cards have no Featured-style labels");
  const order = await page.locator("main section[aria-label]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  ok(order.join(" > ") === "Featured apps > Builders like you > Just posted > Top testers", `Home order: ${order.join(" > ")}`);
  ok((await justPosted.getByRole("link", { name: "See all →" }).getAttribute("href")) === "/browse", "Just posted links to Browse");
  for (const gone of ["Upcoming launches", "Build in public", "Get paid"]) {
    ok((await page.getByRole("region", { name: gone }).count()) === 0, `Home has no ${gone} section`);
  }
  ok((await page.locator("#projects").count()) === 0 && !(await page.getByText("apps need testers").count()), "Home has no project list or testers strip");
  await noSideScroll(page, "home");
  await page.screenshot({ path: OUT + "home-phone.png", fullPage: true });
  await page.getByRole("link", { name: "Search apps" }).click();
  await page.waitForURL(/\/browse/);
  ok(true, "search button opens Browse");
});

await run("home + browse sort", desktop, async (page) => {
  await go(page, "/browse?sort=tried");
  const names = await page.locator("main article a.display").allTextContents();
  ok(names[0] === "PalettePal", `Browse "Most tried" sorts by tries (${names.join(",")})`);
  await go(page, "/");
  await page.screenshot({ path: OUT + "home-desktop.png", fullPage: true });
});

await run("feed (phone)", phone, async (page) => {
  await go(page, "/drops");
  ok((await page.locator("article").count()) === 4, "feed shows 4 sample Drops");
  ok(await page.getByText("Demo mode · sample apps").isVisible(), "demo banner visible");
  const feed = page.getByTestId("drop-feed");
  const box = await feed.boundingBox();
  const tabs = await page.getByRole("navigation", { name: "Main" }).boundingBox();
  const bottomGap = tabs.y - (box.y + box.height);
  ok(Math.abs(bottomGap) <= 1, `feed fills the space above the tab bar (gap ${bottomGap}px)`);
  const tryLink = page.locator("article").first().getByRole("link", { name: "Try it →" });
  ok((await tryLink.getAttribute("href")) === "/try/noteflow?via=feed", "Try it links to /try/<slug>, tagged as from the feed");
  await noSideScroll(page, "feed");
  await page.screenshot({ path: OUT + "feed-phone.png" });

  // Snap scrolling moves one Drop at a time.
  await feed.evaluate((el) => el.scrollBy(0, el.clientHeight));
  await page.waitForTimeout(400);
  const second = await page.locator("article").nth(1).boundingBox();
  ok(Math.abs(second.y - box.y) < 2, "scrolling snaps to the next Drop");

  // Liking while signed out opens the sign-in sheet right there.
  await page.locator("article").nth(1).getByRole("button", { name: "Like" }).click();
  const sheet = page.getByRole("dialog", { name: "Sign in" });
  ok(await sheet.getByRole("heading", { name: "Sign in to like this Drop" }).isVisible(), "like while signed out → sign-in sheet");
  ok(page.url().endsWith("/drops"), "…without leaving the feed");
  await page.waitForTimeout(700);
  await page.screenshot({ path: OUT + "signin-sheet.png" });
  await page.keyboard.press("Escape");
  ok((await sheet.count()) === 0, "Esc closes the sheet");
});

// Themes: follows the phone, the toggle switches and remembers, media stays dark.
{
  const bgOf = (page, sel = "body") => page.evaluate((s) => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
  const ctx = await browser.newContext({ viewport: phone, colorScheme: "light" });
  const page = await ctx.newPage();
  await go(page, "/");
  ok((await bgOf(page)) === "rgb(255, 255, 255)", "light phone setting → white background");
  const featuredBg = await bgOf(page, "[aria-label='Featured apps'] article [class*='@container']");
  ok(featuredBg === "rgb(15, 32, 49)", `featured poster stays dark in light mode (${featuredBg})`);
  await page.getByRole("button", { name: "Switch between light and dark" }).click();
  ok((await page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "toggle switches to dark");
  ok((await bgOf(page)) === "rgb(10, 22, 36)", "dark background after toggle");
  await page.reload();
  ok((await bgOf(page)) === "rgb(10, 22, 36)", "choice is remembered after reload");
  await page.waitForTimeout(1200); // let the entrance animation finish
  await page.screenshot({ path: OUT + "home-dark-phone.png" });
  await page.getByRole("button", { name: "Switch between light and dark" }).click();
  await page.reload();
  ok((await bgOf(page)) === "rgb(255, 255, 255)", "toggle back to light is remembered");
  await page.waitForTimeout(1200); // let the entrance animation finish
  await page.screenshot({ path: OUT + "home-light-phone.png" });
  await go(page, "/drops");
  await page.waitForTimeout(1200); // let the entrance animation finish
  await page.screenshot({ path: OUT + "feed-light-phone.png" });
  await go(page, "/apps/noteflow");
  await page.screenshot({ path: OUT + "app-light-phone.png", fullPage: true });
  await ctx.close();
}

await run("small phone", { width: 360, height: 740 }, async (page) => {
  for (const path of ["/", "/drops", "/browse", "/apps/noteflow", "/u/ada_builds", "/submit", "/login", "/test", "/credits"]) {
    await go(page, path);
    await noSideScroll(page, `360px ${path}`);
  }
});

await run("feed tabs + For you", desktop, async (page) => {
  await go(page, "/drops?tab=trending");
  const first = await page.locator("article").first().getAttribute("aria-label");
  ok(first === "PalettePal Drop", `trending puts most-liked first (${first})`);
  await go(page, "/drops?tab=following");
  ok(await page.getByText("Follow builders you like").isVisible(), "following tab asks you to sign in");

  await go(page, "/drops");
  const tabs = page.getByRole("navigation", { name: "Feed" });
  ok((await tabs.getByRole("link").allTextContents()).join(",") === "For you,Trending,Following", "tabs: For you, Trending, Following");
  ok((await tabs.getByRole("link", { name: "For you" }).getAttribute("aria-current")) === "page", "For you is the default");
  ok((await page.getByRole("navigation", { name: "Categories" }).count()) === 0, "no category filter row on Drops");
  await page.screenshot({ path: OUT + "feed-desktop.png" });

  // What someone's into moves those Drops to the top.
  const firstFor = async (value) => {
    await page.context().addCookies([{ name: "mv-interests", value, url: BASE }]);
    await go(page, "/drops");
    return page.locator("article").first().getAttribute("aria-label");
  };
  ok((await firstFor("education:20")) === "QuizPop Drop", "into education: QuizPop first");
  ok((await firstFor("finance:20")) === "Splitsy Drop", "into finance: Splitsy first");
  ok((await firstFor("finance:20,education:40")) === "QuizPop Drop", "the stronger interest wins");

  // And it learns: watching a Drop for a few seconds counts toward its category.
  await page.context().clearCookies();
  await go(page, "/drops");
  const top = await page.locator("article").first().getAttribute("aria-label");
  await page.waitForTimeout(4600);
  const cookie = (await page.context().cookies()).find((c) => c.name === "mv-interests");
  ok(Boolean(cookie) && /^[a-z_]+%3A1$/.test(cookie.value), `watching ${top} saved an interest (${cookie?.value})`);
  await page.context().clearCookies();
});

await run("menu: Profile, no jobs board", desktop, async (page) => {
  await go(page, "/");
  const nav = page.locator("header nav").first();
  const links = (await nav.getByRole("link").allTextContents()).join(",");
  ok(links === "Home,Drops,Browse,Profile,Challenges", `top menu: ${links}`);
  ok((await nav.getByRole("link", { name: "Profile" }).getAttribute("href")) === "/login", "Profile asks you to sign in first when signed out");
  await go(page, "/jobs");
  ok(new URL(page.url()).pathname === "/browse", "the old jobs board sends people to Browse");
  const top = page.getByRole("region", { name: "Top testers" });
  await go(page, "/");
  ok(await top.isVisible() && (await top.locator("li").count()) > 0, "Home shows this month's top testers");
  await go(page, "/drops");
  ok(await page.locator("article").first().locator(".tag-accent", { hasText: /Hiring|Looking for work|Open to collab|Freelancer/ }).count() === 1, "Drops show the builder's status by their avatar");
});

await run("browse", desktop, async (page) => {
  await go(page, "/browse");
  ok((await page.locator("main article").count()) === 4, "browse shows 4 apps");
  await page.getByLabel("Search apps").fill("palette");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForURL(/q=palette/);
  // The URL changes a moment before the filtered results render.
  await page.waitForFunction(() => document.querySelectorAll("main article").length === 1, null, { timeout: 5000 }).catch(() => {});
  ok((await page.locator("main article").count()) === 1, "search finds PalettePal");
  await go(page, "/browse?stack=supabase&sort=tried");
  const names = await page.locator("main article a.display").allTextContents();
  ok(names.join(",") === "NoteFlow,QuizPop", `stack filter + most tried sort (${names.join(",")})`);
  await go(page, "/browse?category=finance&stage=idea");
  ok((await page.locator("main article").count()) === 1, "category + stage filter");
  await go(page, "/browse");
  await page.screenshot({ path: OUT + "browse-desktop.png", fullPage: true });
});

await run("browse (phone)", phone, async (page) => {
  await go(page, "/browse");
  await noSideScroll(page, "browse phone");
  await page.screenshot({ path: OUT + "browse-phone.png", fullPage: true });
});

await run("app page", desktop, async (page) => {
  await go(page, "/apps/noteflow");
  ok(await page.getByRole("heading", { name: "NoteFlow", exact: true }).isVisible(), "app heading");
  ok((await page.locator("#comments li").count()) === 2, "sample comments listed");
  ok(await page.getByText("Sign in to comment").isVisible() || (await page.getByRole("link", { name: "Sign in" }).count()) > 0, "comment asks to sign in");
  ok(await page.getByRole("link", { name: "Next.js" }).isVisible(), "tech stack chips link to browse");
  await page.screenshot({ path: OUT + "app-desktop.png", fullPage: true });
});

await run("app page (phone)", phone, async (page) => {
  await go(page, "/apps/palettepal");
  await noSideScroll(page, "app phone");
  await page.screenshot({ path: OUT + "app-phone.png", fullPage: true });
});

await run("profile socials", phone, async (page) => {
  await go(page, "/u/june_designs");
  const links = page.getByRole("list", { name: "Social links" });
  ok((await links.getByRole("link").allTextContents()).join(" | ") === "Websiteexample.com | Instagram@june.designs | TikTok@junedesigns", `socials: ${(await links.getByRole("link").allTextContents()).join(" | ")}`);
  const under = await page.evaluate(() => {
    const at = [...document.querySelectorAll("main p")].find((p) => p.textContent === "@june_designs");
    const list = document.querySelector('main [aria-label="Social links"]');
    return Boolean(at && list && at.nextElementSibling === list);
  });
  ok(under, "they sit right under the name");
  ok((await links.getByRole("link", { name: /Instagram/ }).getAttribute("href")) === "https://instagram.com/june.designs", "Instagram opens their profile");
  await noSideScroll(page, "profile with socials");
  await page.screenshot({ path: OUT + "profile-socials-phone.png", clip: { x: 0, y: 0, width: 390, height: 560 } });
});

await run("profile", desktop, async (page) => {
  await go(page, "/u/ada_builds");
  ok(await page.getByRole("heading", { name: "Ada Park" }).isVisible(), "profile heading");
  ok((await page.getByText("Open to collab").count()) === 1 && (await page.locator("main .tag-accent", { hasText: "Open to collab" }).isVisible()), "status shows once, as the badge by the avatar");
  ok(await page.locator("main").getByText("Founder", { exact: true }).isVisible(), "other role tags still shown");
  ok((await page.locator("main article").count()) === 2, "profile lists their 2 apps");
  await page.screenshot({ path: OUT + "profile-desktop.png", fullPage: true });
});

{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const res = await go(page, "/u/nobody_here");
  ok(res.status() === 404, "unknown profile is 404");
  await ctx.close();
}

await run("launch days + boosts", desktop, async (page) => {
  await go(page, "/");
  const featured = page.getByRole("region", { name: "Featured apps" });
  const labels = await featured.locator("article .tag-accent").allTextContents();
  ok(labels.some((l) => l.startsWith("Launch day")) && labels.some((l) => l.startsWith("Boosted")), `Featured row includes launch-day and boosted apps (${labels.join(" | ")})`);
  await go(page, "/browse");
  const soon = page.getByRole("region", { name: "Upcoming launches" });
  ok((await soon.locator("li").count()) === 1 && (await soon.textContent()).includes("QuizPop"), "Launching soon lists QuizPop");
  ok(/2d [34]h/.test(await soon.locator("time").textContent()), `countdown shows days and hours (${await soon.locator("time").textContent()})`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: OUT + "browse-launches.png", fullPage: true });

  await go(page, "/apps/quizpop");
  ok(await page.getByText(/^Launching in/).first().isVisible(), "app page shows the launch countdown");
  ok(await page.locator(".tag-accent", { hasText: "Boosted" }).isVisible(), "app page shows Boosted");
  const grow = page.getByRole("region", { name: "Grow" });
  ok(await grow.getByText("Builder tools · preview in demo mode").isVisible(), "Grow panel preview in demo mode");
  await grow.getByRole("button", { name: /3 days/ }).click();
  await grow.getByText("Method V is running in demo mode").waitFor({ timeout: 5000 });
  ok(true, "boost button explains demo mode");
  await grow.screenshot({ path: OUT + "grow-panel.png" });

  await go(page, "/apps/splitsy");
  ok(await page.getByRole("region", { name: "Grow" }).getByText("It's launch day!").isVisible(), "launch-day state on the app page");
  await go(page, "/apps/noteflow");
  ok(await page.getByRole("region", { name: "Grow" }).getByLabel("Launch date and time").isVisible(), "unscheduled app offers a launch date picker");
});

await run("build in public", desktop, async (page) => {
  await go(page, "/apps/noteflow?tab=updates");
  const appUpdates = page.getByRole("region", { name: "Discussion" });
  ok((await appUpdates.locator("li").count()) === 1 && (await appUpdates.textContent()).includes("Google Meet"), "app page Updates tab shows that app's updates");
  await go(page, "/u/ada_builds");
  ok((await page.getByRole("region", { name: "Updates" }).locator("li").count()) === 2, "profile shows the builder's updates");
  ok(!(await page.getByLabel("Write an update").count()), "no composer on someone else's profile when signed out");
});

{
  const res = await fetch(BASE + "/badge/noteflow");
  const svg = await res.text();
  ok(res.headers.get("content-type").startsWith("image/svg+xml") && svg.includes("METHOD V") && svg.includes("#82ed9d") && svg.includes("412 tries"), "badge is an SVG with the app's tries and the pixel V icon");
  ok(!svg.includes("skewX"), "badge no longer has the V in a box");
  ok((await fetch(BASE + "/badge/nope")).status === 404, "badge for an unknown app is 404");
  ok((await (await fetch(BASE + "/badge/noteflow?theme=light")).text()).includes("#0b1b2b"), "light badge");
}

await run("share kit", desktop, async (page) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await go(page, "/apps/noteflow");
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
  await go(page, "/apps/noteflow");
  const friends = page.getByRole("region", { name: "Friends of this app" });
  ok((await friends.textContent()).includes("PalettePal"), "NoteFlow shows its swap partner PalettePal");
  await go(page, "/apps/palettepal");
  ok((await page.getByRole("region", { name: "Friends of this app" }).textContent()).includes("NoteFlow"), "…and PalettePal shows NoteFlow");
  await go(page, "/apps/quizpop");
  ok((await page.getByRole("region", { name: "Friends of this app" }).count()) === 0, "no Friends section without swaps");
  await go(page, "/swaps");
  ok(await page.getByText("Swaps are off in demo mode.").isVisible(), "swaps page explains demo mode");
});

await run("pixel coder", phone, async (page) => {
  await go(page, "/");
  const footer = page.locator("footer");
  ok(await footer.getByRole("img", { name: "A pixel builder coding at their desk" }).isVisible(), "footer masthead shows the pixel coder");
  const running = await footer.locator(".pc-dust").first().evaluate((el) => getComputedStyle(el).animationName);
  ok(running === "pc-float", "pixels drift away (animation running)");
  ok((await page.locator("header svg.pc-animated").count()) === 0, "no pixel coder next to the logo at the top");
  ok((await page.getByText(/Then try it/i).count()) === 0, "the old tagline is gone");
  ok((await footer.locator("a, nav").count()) === 0, "footer has no links");
  ok(await footer.getByText("Method", { exact: false }).first().isVisible(), "footer shows the Method V logo");
  ok(await footer.getByText("Real apps. Real builders. Real feedback.").isVisible(), "the tagline is under the footer logo");
  {
    const logo = await footer.locator(".wordmark-v").first().boundingBox();
    const tag = await footer.getByText("Real apps. Real builders. Real feedback.").boundingBox();
    ok(tag.y > logo.y + logo.height - 2, "tagline sits right under the logo");
  }
  ok((await page.title()).includes("Real apps. Real builders. Real feedback."), "and in the browser tab title");
  const coder = await footer.getByRole("img", { name: "A pixel builder coding at their desk" }).boundingBox();
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight - parseFloat(getComputedStyle(document.body).paddingBottom));
  ok(coder.x < 16 && Math.abs(coder.y + coder.height - pageHeight) < 2, `pixel coder sits in the bottom-left corner (x ${Math.round(coder.x)})`);
  ok(coder.width >= 150 && coder.width <= 170, `and it's small on phones (${Math.round(coder.width)}px wide)`);
  const bot = footer.getByRole("button", { name: /pixel AI computer/ });
  const botBox = await bot.boundingBox();
  ok(botBox.x + botBox.width > phone.width - 16 && Math.abs(coder.y + coder.height - (botBox.y + botBox.height)) < 2, "pixel AI computer sits in the bottom-right corner, level with the coder");
  ok(botBox.width >= 150 && botBox.width <= 170 && botBox.x > coder.x + coder.width, `and the two don't overlap (${Math.round(botBox.width)}px wide)`);
  await footer.scrollIntoViewIfNeeded();
  const svg = bot.locator("svg");
  const eyeX = () => bot.locator(".bot-eyes rect").first().getAttribute("x");
  const onScreen = await bot.boundingBox();
  await page.mouse.move(0, onScreen.y + 20);
  await page.waitForTimeout(150);
  const left = await eyeX();
  await page.mouse.move(phone.width - 1, onScreen.y + 20);
  await page.waitForTimeout(150);
  const right = await eyeX();
  ok(Number(left) < Number(right), `its eyes follow the pointer (${left} → ${right})`);
  await page.waitForTimeout(2600);
  await footer.screenshot({ path: OUT + "footer-coder.png" });
  await bot.click();
  ok((await svg.getAttribute("data-mode")) === "building" && (await footer.getByText("Building…").count()) === 1, "pressing it builds");
  await page.waitForFunction(() => document.querySelector("footer svg[data-mode]")?.getAttribute("data-mode") === "shipped", null, { timeout: 4000 });
  ok((await footer.getByText("Shipped!").count()) === 1, "then it ships (and says so to screen readers)");
  await page.waitForTimeout(600);
  await footer.screenshot({ path: OUT + "footer-shipped.png" });
  await page.waitForFunction(() => document.querySelector("footer svg[data-mode]")?.getAttribute("data-mode") === "coding", null, { timeout: 5000 });
  ok(true, "and goes back to coding");
  await go(page, "/drops");
  ok((await page.locator("footer").count()) === 0, "no footer under the full-screen Drops feed");
  await go(page, "/browse");
  const more = page.getByRole("navigation", { name: "More on Method V" });
  for (const name of ["Test & earn", "Challenges", "Credits", "Earn", "Pro", "Brands", "Developers", "Get the app"]) {
    ok(await more.getByRole("link", { name, exact: true }).isVisible(), `Browse links ${name}`);
  }
  await noSideScroll(page, "browse with more links");
});

{
  const ctx = await browser.newContext({ viewport: phone, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await go(page, "/");
  const count = await page.locator("footer .pc-dust").first().evaluate((el) => getComputedStyle(el).animationIterationCount);
  ok(count === "1", "reduced motion: the pixel coder doesn't loop");
  await ctx.close();
}

await run("connect + inbox", desktop, async (page) => {
  await go(page, "/u/june_designs");
  ok(await page.getByText("24 connections").isVisible(), "profile shows connections");
  ok(await page.getByText("12 reputation").isVisible(), "profile shows reputation");
  await page.getByRole("button", { name: "Connect" }).click();
  ok(await page.getByRole("heading", { name: "Sign in to connect" }).isVisible(), "Connect while signed out opens the sign-in sheet");
  await page.getByRole("button", { name: "Close" }).click();
  await go(page, "/inbox");
  ok(await page.getByText("The inbox is off in demo mode.").isVisible(), "inbox explains demo mode");
});

await run("q&a", desktop, async (page) => {
  await go(page, "/apps/noteflow");
  const discussion = page.getByRole("region", { name: "Discussion" });
  ok((await discussion.getByRole("link", { name: /Comments/ }).getAttribute("aria-current")) === "page", "Comments is the default tab");
  await discussion.getByRole("link", { name: /Q&A/ }).click();
  await page.waitForURL(/tab=qa/);
  await page.locator("#qa").waitFor();
  ok((await page.locator("#qa > div > ul > li").count()) === 2 || (await page.locator("#qa li[id^='q-']").count()) === 2, "Q&A tab lists the app's questions");
  ok(await page.locator("#qa").getByText("✓ Best answer").isVisible(), "best answer is marked");
  ok(await page.locator("#qa .tag", { hasText: "Builder" }).first().isVisible(), "builder's answers are labeled");
  ok((await page.locator("#qa").textContent()).indexOf("Both! Meet import") < (await page.locator("#qa").textContent()).indexOf("Can confirm"), "best answer is listed first");
  ok(await page.locator("#qa").getByText("Sign in").isVisible(), "signed-out visitors are asked to sign in");
  await page.locator("#qa").getByRole("button", { name: "Upvote" }).first().click();
  ok(await page.getByRole("heading", { name: "Sign in to vote" }).isVisible(), "voting while signed out opens the sign-in sheet");
  await page.keyboard.press("Escape");
  await go(page, "/apps/noteflow?tab=qa");
  await page.locator("#qa").screenshot({ path: OUT + "qa.png" });
});

await run("builders like you", phone, async (page) => {
  await go(page, "/");
  const s = page.getByRole("region", { name: "Builders like you" });
  ok((await s.locator(":scope > ul > li").count()) === 2, "Home suggests builders");
  ok((await s.locator(":scope > ul > li").first().textContent()).includes("In common: Design · React"), "cards say what you have in common");
  await noSideScroll(page, "home with suggestions");
});

await run("tester passport", desktop, async (page) => {
  await go(page, "/u/marco_ships");
  const passport = page.getByRole("region", { name: "Tester Passport" });
  ok(await passport.getByRole("heading", { name: "Pro Tester" }).isVisible(), "41 feedback + 17 helpful = Pro Tester");
  ok(await passport.getByText("Next: Trusted Tester").isVisible(), "shows the next rank");
  ok((await passport.locator("li.border-accent").count()) === 8, "8 of 10 category stamps filled");
  await passport.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await passport.screenshot({ path: OUT + "passport.png" });
  await go(page, "/test");
  const top = page.getByRole("region", { name: "Top testers" });
  ok((await top.locator("li").count()) === 3, "top testers board lists testers");
  ok((await top.locator("li").first().textContent()).includes("Marco"), "most helpful tester is first");
});

await run("login", phone, async (page) => {
  await go(page, "/login");
  ok(await page.getByLabel("Password", { exact: true }).isVisible(), "sign in with email and password");
  ok(await page.getByRole("button", { name: "Sign in", exact: true }).isDisabled(), "sign-in disabled in demo mode");
  await page.getByRole("tab", { name: "Create account" }).click();
  ok((await page.getByRole("tab", { name: "Create account" }).getAttribute("aria-selected")) === "true", "switch to Create account");
  ok((await page.getByLabel("Password", { exact: true }).getAttribute("autocomplete")) === "new-password", "new accounts get a new-password field");
  ok(await page.getByRole("button", { name: "Create account", exact: true }).isVisible(), "Create account button");
  await page.getByRole("button", { name: "Forgot your password? Email me a sign-in link" }).click();
  ok(await page.getByRole("button", { name: "Email me a sign-in link" }).isDisabled(), "emailed link is still there as the fallback");
  ok((await page.getByLabel("Password", { exact: true }).count()) === 0, "the link option needs no password");
  await noSideScroll(page, "login");
});

await run("submit", desktop, async (page) => {
  await go(page, "/submit");
  const input = page.getByLabel("Drop video");
  await input.setInputFiles(CLIPS + "clip-62s.webm");
  await page.getByText(/Drops can be up to 60 seconds/).waitFor({ timeout: 15000 });
  ok(true, "62-second video is rejected");
  await input.setInputFiles(CLIPS + "clip-20s.webm");
  await page.getByText(/^0:20 ·/).waitFor({ timeout: 15000 });
  ok(true, "20-second video is accepted and shows 0:20");
  ok(await page.getByText("Still need: your link, a name, a tagline, a category.").isVisible(), "tells you what's still needed");
  const link = page.getByRole("textbox", { name: /Link to your live app/ });
  await link.fill("https://example.com");
  await link.blur();
  ok(await page.getByText("Method V is running in demo mode").first().isVisible(), "reading the site explains demo mode");
  await page.getByRole("textbox", { name: /^Name/ }).fill("Test");
  await page.getByRole("textbox", { name: /Tagline/ }).fill("Testing");
  await page.getByRole("radio", { name: "AI tools" }).click();
  ok((await page.getByRole("radio", { name: "AI tools" }).getAttribute("aria-checked")) === "true", "one tap picks a category");
  ok(!(await page.getByRole("textbox", { name: /Built with/ }).isVisible()), "extra details are tucked away");
  await page.getByText("More details").click();
  ok(await page.getByRole("textbox", { name: /Built with/ }).isVisible(), "…and open with one tap");
  ok(!(await page.getByText(/^Still need/).count()), "nothing missing once the basics are in");
  await page.getByRole("button", { name: "Post Drop" }).click();
  ok(await page.locator("form p.rounded-lg", { hasText: "Method V is running in demo mode" }).isVisible(), "posting explains demo mode");
  await page.screenshot({ path: OUT + "submit-desktop.png", fullPage: true });
});

await run("test & earn", desktop, async (page) => {
  await go(page, "/test");
  ok(await page.getByRole("heading", { name: "Test & earn" }).isVisible(), "Test & earn page loads");
  ok((await page.locator("main article").count()) === 2, "queue shows the 2 sample apps waiting for testers");
  ok(await page.getByText("4 spots left").isVisible(), "shows spots left");
  await page.getByRole("link", { name: "Test it →" }).first().click();
  await page.waitForURL(/\/apps\/.+#feedback/);
  ok(await page.locator("#feedback").getByText("off in demo mode").isVisible(), "feedback panel explains demo mode");
  const panel = page.locator("#feedback");
  ok(await panel.getByRole("heading", { name: "Test & earn" }).isVisible() && (await panel.locator("ol li").count()) === 3, "the app page explains Test & earn in 3 steps");
  const below = await page.evaluate(() => {
    const d = document.querySelector("main p.leading-relaxed");
    const f = document.getElementById("feedback");
    return Boolean(d && f && d.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING && f.getBoundingClientRect().top - d.getBoundingClientRect().bottom < 60);
  });
  ok(below, "Test & earn sits right under the app's description");
  await page.screenshot({ path: OUT + "test-desktop.png", fullPage: true });
});

await run("app stats", desktop, async (page) => {
  await go(page, "/apps/palettepal");
  ok(await page.getByText("87%").isVisible(), "shows % who would use it (27 of 31)");
  ok(await page.getByText("4.6★").isVisible(), "shows average rating (142 / 31)");
  await go(page, "/apps/splitsy");
  ok(await page.getByText("No feedback yet").first().isVisible(), "no-feedback state");
});

await run("test & earn (phone)", phone, async (page) => {
  await go(page, "/test");
  await noSideScroll(page, "test phone");
  const tabs = page.getByRole("navigation", { name: "Main" });
  ok(await tabs.isVisible(), "bottom tab bar on phones");
  ok((await tabs.getByRole("link").allTextContents()).map((t) => t.trim()).filter(Boolean).join(",") === "Home,Drops,Browse,Me", `phone tabs: Home, Drops, +, Browse, Me (${(await tabs.getByRole("link").allTextContents()).join(",")})`);
  await page.screenshot({ path: OUT + "test-phone.png", fullPage: true });
});

await run("credits", phone, async (page) => {
  await go(page, "/credits");
  ok(await page.getByText("How credits work").isVisible(), "credits page explains the rules");
});

await run("+ opens the camera/library", phone, async (page) => {
  await go(page, "/");
  const plus = page.getByRole("navigation", { name: "Main" }).getByLabel("Post a Drop");
  ok((await plus.getAttribute("type")) === "file" && (await plus.getAttribute("accept")) === "video/*", "+ is a video picker on phones");
  await plus.setInputFiles(CLIPS + "clip-20s.webm");
  await page.waitForURL(/\/submit$/);
  await page.getByText(/^0:20 ·/).waitFor({ timeout: 15000 });
  ok(await page.getByRole("region", { name: "Your Drop" }).getByLabel("Your Drop").isVisible() || (await page.locator("video[aria-label='Your Drop']").count()) === 1, "the Post screen opens with that video ready");
  ok(await page.getByText("Change video").isVisible(), "…with a way to change it");
  await page.screenshot({ path: OUT + "submit-flow-phone.png", fullPage: true });
});

await run("submit (phone)", phone, async (page) => {
  await go(page, "/submit");
  await noSideScroll(page, "submit phone");
  await page.screenshot({ path: OUT + "submit-phone.png", fullPage: true });
});

// ---------------------------------------------------------------------------
// Phase 4: Earn
// ---------------------------------------------------------------------------

await run("back an app + sponsor (desktop)", desktop, async (page) => {
  await go(page, "/apps/quizpop");
  const card = page.getByRole("complementary", { name: "Sponsored" });
  ok(await card.isVisible(), "sponsored app shows a labeled Sponsored card");
  const href = await card.getByRole("link").getAttribute("href");
  ok(/^\/try\/noteflow\?s=/.test(href ?? ""), `sponsor card goes through /try with the deal (${href})`);
  const backers = page.getByRole("region", { name: "Backers" });
  ok((await backers.locator("li").count()) === 1 && (await backers.textContent()).includes("niece"), "backers wall shows names and notes");
  ok(!/\$\d/.test(await backers.textContent()), "backers wall never shows amounts");

  await page.getByRole("button", { name: "♥ Back it" }).click();
  const dialog = page.getByRole("dialog", { name: "Back QuizPop" });
  ok(await dialog.isVisible(), "Back it opens the tip sheet");
  await dialog.getByRole("radio", { name: "$10" }).click();
  ok((await dialog.getByRole("button", { name: /Back with \$10/ }).count()) === 1, "preset amounts fill the button");
  await dialog.getByLabel("Other amount in dollars").fill("0.5");
  ok(await dialog.getByText("Tip between $1 and $500.").isVisible(), "too-small tips are caught before checkout");
  await dialog.getByLabel("Other amount in dollars").fill("7");
  await dialog.getByRole("button", { name: /Back with \$7/ }).click();
  await dialog.getByText(/demo mode/i).waitFor();
  ok(true, "backing explains demo mode");

  const offer = page.getByRole("region", { name: "Sponsor" });
  await offer.getByRole("button", { name: "Make an offer" }).click();
  await offer.getByLabel("Price per try in dollars").fill("0.25");
  await offer.getByLabel("Budget in dollars").fill("20");
  ok(await offer.getByText("Up to 80 tries.").isVisible(), "offer shows how many tries the budget buys");
  await offer.getByRole("button", { name: "Send offer" }).click();
  await offer.getByText(/demo mode/i).waitFor();
  ok(true, "sponsor offers explain demo mode");
  await page.screenshot({ path: `${OUT}app-earn-desktop.png`, fullPage: true });

  await go(page, "/apps/noteflow");
  ok((await page.getByRole("complementary", { name: "Sponsored" }).count()) === 0, "unsponsored apps show no card");
});

await run("drops feed sponsor (phone)", phone, async (page) => {
  await go(page, "/drops");
  const sponsored = page.locator("article a[href^='/try/noteflow?s=']");
  ok((await sponsored.count()) === 1, "the sponsored Drop carries one Sponsored card");
  ok((await sponsored.textContent()).includes("Sponsored"), "the feed card is labeled Sponsored");
});

await run("earn + pro (phone)", phone, async (page) => {
  await go(page, "/earn");
  ok(await page.getByText(/demo mode, so there/).isVisible(), "Earn explains demo mode");
  ok((await page.getByRole("region", { name: "Balance" }).textContent()).includes("$0"), "balance shows");
  await go(page, "/pro");
  ok(await page.getByText("Stats for 30 and 90 days").isVisible(), "Pro lists its perks");
  ok(await page.getByRole("link", { name: "Open your stats →" }).isVisible(), "Pro links to the stats dashboard");
  await page.getByRole("button", { name: /Add 30 days|Get Pro/ }).click();
  await page.getByText(/Add your Supabase keys/).first().waitFor({ timeout: 10_000 });
  ok(true, "buying Pro explains demo mode");
  await noSideScroll(page, "pro");
  await page.screenshot({ path: `${OUT}pro-phone.png`, fullPage: true });
  await go(page, "/u/ada_builds");
  ok(await page.getByTitle("Method V Pro").isVisible(), "Pro badge on a Pro profile");
  ok((await page.locator("main").getByText("Pinned", { exact: true }).count()) === 1, "pinned app is labeled");
  await go(page, "/u/marco_ships");
  ok((await page.getByTitle("Method V Pro").count()) === 0, "no badge without Pro");
});

await run("challenges (desktop)", desktop, async (page) => {
  await go(page, "/");
  ok(await page.getByRole("navigation").getByRole("link", { name: "Challenges" }).first().isVisible(), "Challenges in the desktop nav");
  await go(page, "/challenges");
  ok((await page.locator("main li a[href^='/challenges/']").count()) === 2, "two demo challenges");
  await go(page, "/challenges/best-supabase-app");
  const entries = page.getByRole("region", { name: "Entries" }).locator("ol > li");
  ok((await entries.count()) === 2, "entries listed");
  ok((await entries.first().textContent()).includes("NoteFlow"), "ranked by votes");
  await entries.first().getByRole("button", { name: /▲/ }).click();
  await page.getByText(/Add your Supabase keys/).first().waitFor({ timeout: 10_000 });
  ok(true, "voting explains demo mode");
  await page.screenshot({ path: `${OUT}challenges-desktop.png`, fullPage: true });
});

await run("phase 4 pages (phone)", phone, async (page) => {
  for (const path of ["/earn", "/pro", "/challenges", "/challenges/build-for-teachers", "/apps/quizpop"]) {
    await go(page, path);
    await noSideScroll(page, path);
  }
});

ok((await fetch(BASE + "/jobs/nope", { redirect: "manual" })).headers.get("location")?.endsWith("/browse"), "old job links redirect to Browse");
ok((await fetch(BASE + "/challenges/nope")).status === 404, "unknown challenge is 404");
let res = await fetch(BASE + "/api/stripe/webhook", { method: "POST", body: "{}" });
ok(res.status === 404, `webhook is off without Stripe keys (${res.status})`);
res = await fetch(BASE + "/try/noteflow?s=00000000-0000-0000-0000-000000000000", { redirect: "manual" });
ok(res.status === 303, "sponsor links still redirect to the app");

// ---------------------------------------------------------------------------
// Phase 5: Scale
// ---------------------------------------------------------------------------

await run("stats dashboard (phone)", phone, async (page) => {
  await go(page, "/dashboard");
  ok((await page.getByRole("heading", { level: 1 }).textContent()) === "Stats", "dashboard opens");
  const chart = page.getByRole("figure", { name: /Tries for NoteFlow/ });
  ok((await chart.locator("[title]").count()) === 7, "7 days by default");
  await page.getByRole("navigation", { name: "Range" }).getByRole("link", { name: "30d" }).click();
  await page.waitForURL(/days=30/);
  ok((await page.getByRole("figure", { name: /Tries for/ }).locator("[title]").count()) === 30, "30-day range for Pro");
  const sources = page.getByRole("region", { name: "Where tries come from" });
  ok((await sources.textContent()).includes("Embeds on other sites"), "tries are broken down by source");
  await page.getByRole("navigation", { name: "Your apps" }).getByRole("link", { name: "Splitsy" }).click();
  await page.waitForURL(/app=splitsy/);
  ok(await page.getByRole("figure", { name: /Tries for Splitsy/ }).isVisible(), "switch between your apps");
  ok(await page.getByRole("link", { name: "Download CSV" }).isVisible(), "Pro can download a CSV");
  await noSideScroll(page, "dashboard");
  await page.screenshot({ path: `${OUT}dashboard-phone.png`, fullPage: true });
});

await run("brands (desktop)", desktop, async (page) => {
  await go(page, "/brands");
  ok(await page.getByRole("link", { name: /PixelHost/ }).isVisible(), "brand directory lists verified brands");
  await go(page, "/brands/pixelhost");
  ok(await page.getByText("Verified sponsor").isVisible(), "brand page shows it's verified");
  ok((await page.getByRole("region", { name: "Sponsoring" }).textContent()).includes("PalettePal"), "brand page lists who it sponsors");
  await go(page, "/apps/palettepal");
  const card = page.getByRole("complementary", { name: "Sponsored" });
  ok(/^\/go\/pixelhost\?s=/.test((await card.getByRole("link").getAttribute("href")) ?? ""), "brand sponsor cards go through /go");
  ok(await card.getByRole("link", { name: "Visit PixelHost →" }).isVisible(), "brand cards say Visit");
  await go(page, "/brands/new");
  await page.getByLabel("Website").fill("https://example.com");
  await page.getByLabel("Brand name").fill("Acme");
  await page.getByLabel("One line about it").fill("Tools for builders");
  await page.getByRole("button", { name: "List the brand" }).click();
  await page.getByText(/Add your Supabase keys/).first().waitFor({ timeout: 10_000 });
  ok(true, "listing a brand explains demo mode");
  await page.screenshot({ path: `${OUT}brands-desktop.png`, fullPage: true });
});

await run("developers + install (phone)", phone, async (page) => {
  await go(page, "/developers");
  ok(await page.getByText("/api/v1/apps/{slug}").isVisible(), "API docs list the endpoints");
  const frame = page.frameLocator("iframe[title^='NoteFlow on Method V']");
  await frame.getByRole("link", { name: "Try it →" }).waitFor();
  ok((await frame.getByRole("link", { name: "Try it →" }).getAttribute("href")).endsWith("/try/noteflow?via=embed"), "the example embed renders with a counted Try link");
  await noSideScroll(page, "developers");
  await go(page, "/app");
  ok(await page.getByRole("heading", { name: "iPhone and iPad" }).isVisible(), "install steps for iPhone");
  ok(await page.getByRole("heading", { name: "Android" }).isVisible(), "install steps for Android");
  await noSideScroll(page, "get the app");
  await go(page, "/offline");
  ok(await page.getByRole("heading", { name: "You're offline" }).isVisible(), "offline page");
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  ok(manifestHref === "/manifest.webmanifest", `pages link the manifest (${manifestHref})`);
  ok((await page.locator('link[rel="apple-touch-icon"]').count()) > 0, "pages link an iPhone home-screen icon");
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.active?.scriptURL ?? reg.installing?.scriptURL ?? reg.waiting?.scriptURL ?? "registered" : null;
  });
  ok(Boolean(sw), `service worker registers (${sw})`);
});

{
  const manifest = await (await fetch(BASE + "/manifest.webmanifest")).json();
  ok(manifest.name === "Method V" && manifest.display === "standalone", "manifest makes the site installable");
  ok(manifest.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"), "manifest has a maskable icon");
  for (const icon of manifest.icons) {
    const r = await fetch(BASE + icon.src);
    const bytes = new Uint8Array(await r.arrayBuffer());
    ok(r.status === 200 && r.headers.get("content-type") === "image/png" && bytes[1] === 0x50, `icon ${icon.src} is a PNG`);
  }
  ok((await fetch(BASE + "/app-icon/huge")).status === 404, "unknown icon size is 404");
  const sw = await fetch(BASE + "/sw.js");
  ok(sw.status === 200 && /no-cache/.test(sw.headers.get("cache-control") ?? ""), "service worker is never cached");

  const home = await fetch(BASE + "/");
  ok(home.headers.get("x-frame-options") === "DENY", "pages can't be framed by other sites");
  const embed = await fetch(BASE + "/embed/noteflow?theme=light");
  const embedHtml = await embed.text();
  ok(embed.status === 200 && !embed.headers.get("x-frame-options"), "the embed card can be framed");
  ok(/frame-ancestors \*/.test(embed.headers.get("content-security-policy") ?? "") && /default-src 'none'/.test(embed.headers.get("content-security-policy") ?? ""), "the embed runs no scripts");
  ok(embedHtml.includes("NoteFlow") && embedHtml.includes("/try/noteflow?via=embed") && embedHtml.includes("#0b1b2b"), "embed shows the app, a counted Try link and the light theme");
  ok(!/<script/i.test(embedHtml), "embed has no scripts");
  ok((await fetch(BASE + "/embed/nope")).status === 404, "unknown embed is 404");

  const index = await fetch(BASE + "/api/v1");
  ok(index.headers.get("access-control-allow-origin") === "*", "API is open to other sites (CORS)");
  ok(Boolean((await index.json()).endpoints.apps), "API index lists endpoints");
  const apps = await (await fetch(BASE + "/api/v1/apps")).json();
  ok(apps.apps.length === 4 && apps.apps.every((a) => a.try_url.endsWith(`/try/${a.slug}?via=api`)), "apps list with counted try links");
  ok(!JSON.stringify(apps).includes("owner_id") && !JSON.stringify(apps).includes('"url":"https://example.com"'), "API leaves out internal ids and raw links");
  const edu = await (await fetch(BASE + "/api/v1/apps?category=education&limit=1")).json();
  ok(edu.apps.length === 1 && edu.apps[0].slug === "quizpop", "filters and limit work");
  const one = await (await fetch(BASE + "/api/v1/apps/noteflow")).json();
  ok(one.app.stats.tries === 412 && one.app.builder.username === "ada_builds", "one app with stats and builder");
  const missing = await fetch(BASE + "/api/v1/apps/nope");
  ok(missing.status === 404 && (await missing.json()).error, "unknown app is a 404 with a message");
  const user = await (await fetch(BASE + "/api/v1/users/ada_builds")).json();
  ok(user.user.pro === true && user.apps.length === 2, "builder profile with their apps");
  ok(!("credits" in user.user) && !("payouts_enabled" in user.user), "profiles leave out private fields");
  ok((await fetch(BASE + "/api/v1/jobs")).status === 404, "no jobs endpoint any more");
  ok((await (await fetch(BASE + "/api/v1/challenges")).json()).challenges.length === 2, "challenges endpoint");
  const pre = await fetch(BASE + "/api/v1/apps", { method: "OPTIONS" });
  ok(pre.status === 204 && pre.headers.get("access-control-allow-methods")?.includes("GET"), "CORS preflight");
  ok((await fetch(BASE + "/go/pixelhost", { redirect: "manual" })).status === 303, "brand links redirect");
  ok((await fetch(BASE + "/go/nope", { redirect: "manual" })).status === 404, "unknown brand is 404");
  for (const path of ["/api/mobile/apps", "/api/mobile/preview"]) {
    const r = await fetch(BASE + path, { method: "POST", headers: { Authorization: "Bearer fake" }, body: "{}" });
    ok(r.status === 503 && /demo mode/.test((await r.json()).error), `${path} explains demo mode`);
  }
  const health = await (await fetch(BASE + "/api/health")).json();
  ok(health.ready === false && health.checks.supabase_keys.ok === false, "setup check says what's missing in demo mode");
  ok(!JSON.stringify(health).match(/sb_(secret|publishable)_|eyJ/), "setup check never shows keys");
  const csv = await fetch(BASE + "/dashboard/export?app=noteflow&days=30");
  const csvText = await csv.text();
  ok(csv.headers.get("content-type")?.startsWith("text/csv") && csvText.trim().split("\n").length === 31, "CSV export has a header and 30 days");
}

await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
