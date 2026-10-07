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

// The "Post a Drop, get +10 Methodium" pop-up on Home (demo promotion) would
// cover the page in every test, so it starts closed unless a test asks for it.
const DEMO_BONUS_ENDS = "2026-11-01T06:59:59Z";
const bonusSeen = (ctx) =>
  ctx.addInitScript((ends) => {
    try {
      localStorage.setItem("method-v-promo-seen:drop_bonus", ends);
    } catch {
      // Sandboxed previews (the email templates) have no storage.
    }
  }, DEMO_BONUS_ENDS);

async function run(name, viewport, fn, { popups = false } = {}) {
  const ctx = await browser.newContext({ viewport });
  if (!popups) await bonusSeen(ctx);
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
  const featured = page.getByRole("region", { name: "In the Spotlight" });
  ok((await featured.locator("article").count()) === 4, "the Spotlight stage has 4 apps: 1 on top, 3 under it");
  ok((await featured.locator("article").first().textContent()).includes("QuizPop"), "the paid Spotlight takes the top spot");
  ok((await featured.locator("article").nth(1).getAttribute("class")).includes("snap-start"), "the 3 under it swipe sideways on phones");
  ok((await featured.locator(".stage-beam").count()) === 4, "a light shines on each of them");
  ok(await page.getByRole("region", { name: "Builders like you" }).isVisible(), "Home shows builders to follow");
  const justPosted = page.getByRole("region", { name: "Just posted" });
  const newest = await justPosted.locator("article a.display").allTextContents();
  ok(newest.length === 4 && newest[0] === "NoteFlow", `Just posted lists the newest projects first (${newest.join(",")})`);
  ok((await justPosted.locator("article").first().getAttribute("class")).includes("snap-start"), "Just posted swipes sideways too");
  ok((await justPosted.locator("article .tag-accent").count()) === 0, "Just posted cards have no Featured-style labels");
  // Each card: the picture as a banner with the app's logo over its edge (sample apps have no logo, so their first letter).
  const logos = await justPosted.locator("article [data-app-logo]").allTextContents();
  ok(logos.length === 4 && logos[0] === "N", `Just posted cards show each app's logo, its first letter without one (${logos.join("")})`);
  const order = await page.locator("main section[aria-label]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  ok(order.join(" > ") === "In the Spotlight > Builders like you > Just posted", `Home order: the Spotlight comes first, no "post your app" box (${order.join(" > ")})`);
  // (Hidden on phones, which use the + tab; it shows from tablet width up.)
  ok((await page.locator("header a[href='/submit']", { hasText: "Post your project" }).count()) === 1, "the top-right button says Post your project");
  ok((await page.getByRole("link", { name: /Monthly leaderboards/ }).getAttribute("href")) === "/browse#leaderboards", "Home links to the leaderboards on Browse");
  await go(page, "/browse");
  const boards = page.getByRole("region", { name: "Leaderboards" });
  const builders = await boards.getByRole("region", { name: "Top builders" }).locator("li a").allTextContents();
  ok(builders[0]?.includes("Okafor Studio"), `Browse: top builder this month leads (${builders.join(", ")})`);
  ok((await boards.getByText("1st wins 25 Methodium · 2nd 15 · 3rd 10", { exact: false }).count()) === 2, "both boards say what the top 3 win");
  const prizes = await boards.getByRole("region", { name: "Top builders" }).locator("li .tag-accent").allTextContents();
  ok(prizes.slice(0, 3).join(",") === "+25,+15,+10", `the top 3 show their prize (${prizes.join(",")})`);
  await go(page, "/browse?category=education");
  ok((await page.getByRole("region", { name: "Leaderboards" }).count()) === 0, "filtering Browse hides the boards");
  await go(page, "/");
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
  // People search on Browse.
  await go(page, "/browse?q=ada");
  const people = page.getByRole("region", { name: "People" });
  ok((await people.getByRole("link").first().getAttribute("href")) === "/u/ada_builds", "Browse search finds people by name");

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
  // The feed order shifts as the sample Drops age, so any app will do.
  ok(/^\/try\/[a-z0-9-]+\?via=feed$/.test((await tryLink.getAttribute("href")) ?? ""), "Try it links to /try/<slug>, tagged as from the feed");
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
  await bonusSeen(ctx);
  const page = await ctx.newPage();
  await go(page, "/");
  ok((await bgOf(page)) === "rgb(255, 255, 255)", "light phone setting → white background");
  const featuredBg = await bgOf(page, "[aria-label='In the Spotlight'] article [class*='@container']");
  ok(featuredBg === "rgb(15, 32, 49)", `featured poster stays dark in light mode (${featuredBg})`);
  await page.getByRole("button", { name: "Switch between light and dark" }).click();
  ok((await page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "toggle switches to dark");
  ok((await bgOf(page)) === "rgb(17, 19, 18)", "dark (charcoal) background after toggle");
  await page.reload();
  ok((await bgOf(page)) === "rgb(17, 19, 18)", "choice is remembered after reload");
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
  ok((await tabs.getByRole("link").allTextContents()).join(",") === "For you,Trending,Following,Questions", "tabs: For you, Trending, Following, Questions");
  ok((await tabs.getByRole("link", { name: "For you" }).getAttribute("aria-current")) === "page", "For you is the default");
  ok((await page.getByRole("navigation", { name: "Categories" }).count()) === 0, "no category filter row on Drops");
  await page.screenshot({ path: OUT + "feed-desktop.png" });

  // The order changes on every visit, and never opens on the same Drop twice.
  const openers = [];
  for (let i = 0; i < 8; i++) {
    await go(page, "/drops");
    openers.push(await page.locator("article").first().getAttribute("aria-label"));
    await page.waitForTimeout(150);
  }
  ok(new Set(openers).size > 1 && openers.every((o, i) => i === 0 || o !== openers[i - 1]), `For you opens on a different Drop each visit (${openers.join(" > ")})`);

  // What someone's into moves those Drops to the top (with the shuffle off,
  // which demo mode allows, to see the ranking on its own).
  await page.context().addCookies([{ name: "mv_feed_shuffle", value: "off", url: BASE }]);
  const firstFor = async (value) => {
    await page.context().addCookies([{ name: "mv-interests", value, url: BASE }]);
    await go(page, "/drops");
    return page.locator("article").first().getAttribute("aria-label");
  };
  const eduFirst = await firstFor("education:20");
  ok(eduFirst === "QuizPop Drop", `into education: QuizPop first (${eduFirst})`);
  ok((await firstFor("finance:20")) === "Splitsy Drop", "into finance: Splitsy first");
  ok((await firstFor("finance:20,education:40")) === "QuizPop Drop", "the stronger interest wins");

  // Watching for 3 seconds and moving on isn't a skip (it used to count as one).
  await page.context().addCookies([{ name: "mv-interests", value: "productivity:5", url: BASE }]);
  await go(page, "/drops");
  ok((await page.locator("article").first().getAttribute("aria-label")) === "NoteFlow Drop", "into productivity: NoteFlow first");
  await page.waitForTimeout(3000);
  // Scroll like a finger does (smoothly), so the slide passes through partly visible.
  await page.getByTestId("drop-feed").evaluate(async (el) => {
    for (let i = 1; i <= 20; i++) {
      el.scrollTop = (el.clientHeight * i) / 20;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
  });
  await page.waitForTimeout(800);
  const afterWatch = decodeURIComponent((await page.context().cookies()).find((c) => c.name === "mv-interests")?.value ?? "");
  ok(afterWatch === "productivity:5", `a 3-second watch doesn't count as a skip (${afterWatch})`);
  // A quick swipe past does count a little against the category.
  await page.context().addCookies([{ name: "mv-interests", value: "productivity:5,education:5", url: BASE }]);
  await go(page, "/drops");
  const firstTwo = await page.locator("article").evaluateAll((els) => els.slice(0, 2).map((e) => e.getAttribute("aria-label")));
  await page.waitForTimeout(400);
  await page.getByTestId("drop-feed").evaluate((el) => el.scrollBy(0, el.clientHeight));
  await page.waitForTimeout(800);
  const afterSkip = decodeURIComponent((await page.context().cookies()).find((c) => c.name === "mv-interests")?.value ?? "");
  ok(/:4\.5/.test(afterSkip), `swiping past ${firstTwo[0]} right away counts a little against it (${afterSkip})`);

  // And it learns: watching a Drop for a few seconds counts toward its category.
  await page.context().clearCookies();
  await page.context().addCookies([{ name: "mv_feed_shuffle", value: "off", url: BASE }]);
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
  ok(links === "Home,Drops,Browse,V Store,Profile", `top menu: ${links}`);
  ok((await nav.getByRole("link", { name: "Profile" }).getAttribute("href")) === "/login", "Profile asks you to sign in first when signed out");
  await go(page, "/jobs");
  ok(new URL(page.url()).pathname === "/browse", "the old jobs board sends people to Browse");
  const top = page.getByRole("region", { name: "Top testers" });
  await go(page, "/browse");
  ok(await top.isVisible() && (await top.locator("li").count()) > 0, "Browse shows this month's top testers");
  await go(page, "/drops");
  ok(await page.locator("article").first().locator(".tag-accent", { hasText: /Hiring|Looking for work|Open to collab|Freelancer/ }).count() === 1, "Drops show the builder's status by their avatar");
});

await run("questions feed (phone)", phone, async (page) => {
  await go(page, "/drops?tab=questions");
  const feed = page.getByTestId("question-feed");
  const cards = feed.locator("article");
  ok((await cards.count()) === 4, `every sample question is a card (${await cards.count()})`);
  ok((await feed.locator("article").first().getAttribute("class")).includes("snap-start"), "one question per screen, swipe for the next");
  ok((await cards.first().getAttribute("aria-label")) === "Question about QuizPop", `an unanswered builder poll leads (${await cards.first().getAttribute("aria-label")})`);
  const first = feed.getByRole("article", { name: "Question about PalettePal" });
  ok(await first.getByText("Builder asks").isVisible(), "builders asking about their own app are labeled");
  const poll = first.getByRole("group", { name: "Poll" });
  ok((await poll.getByRole("button").count()) === 4 && (await poll.getByText("49 votes · tap to vote and see results").isVisible()), "poll shows its choices and total");
  await poll.getByRole("button", { name: "Tailwind config" }).click();
  ok(await page.getByRole("dialog", { name: "Sign in" }).getByText("Sign in to vote in this poll").isVisible(), "voting asks you to sign in first");
  await page.getByRole("dialog", { name: "Sign in" }).getByRole("button", { name: "Close" }).click();
  ok(await first.getByText("Tailwind config, easy.").isVisible(), "the top answer previews on the card");
  ok(await feed.getByRole("link", { name: "Ask a question" }).count() === 1, "the last card invites you to ask");
  await noSideScroll(page, "questions feed");
  await page.screenshot({ path: OUT + "questions-phone.png" });
  await go(page, "/drops?tab=questions");
  await page.getByTestId("question-feed").getByRole("article", { name: "Question about PalettePal" }).getByRole("link", { name: "Answer →" }).click();
  await page.waitForURL(/\/q\//);
  ok(await page.getByText("Which export should I add next?").isVisible(), "thread shows the question");
  ok(await page.getByRole("group", { name: "Poll" }).isVisible(), "…with its poll");
  const reply = page.locator("li", { hasText: "Same, and CSS variables" }).last();
  ok((await reply.getAttribute("class")).includes("ml-8"), "replies sit indented under the answer they reply to");
  ok(await page.getByText("to answer, reply or vote.").isVisible(), "signed out: sign in to join the thread");
  await noSideScroll(page, "question thread");
  await page.screenshot({ path: OUT + "question-thread-phone.png", fullPage: true });
});

await run("ask + Q&A on app pages", desktop, async (page) => {
  await go(page, "/ask");
  ok(await page.getByText("asking is off").isVisible(), "the Ask page explains demo mode");
  await go(page, "/submit");
  ok((await page.getByRole("link", { name: "Or ask a question about your app →" }).getAttribute("href")) === "/ask", "Post links to Ask");
  await go(page, "/apps/noteflow?tab=qa");
  ok(await page.getByText("Does it work with Google Meet recordings, or only Zoom?").isVisible(), "app page Q&A still lists its questions");
  ok((await page.getByRole("link", { name: "Open thread →" }).count()) === 2, "each question links to its thread");
  ok((await fetch(BASE + "/q/nope")).status === 404, "unknown question is 404");
});

await run("push notification setup", desktop, async (page) => {
  await go(page, "/setup/push-keys");
  await page.getByLabel("NEXT_PUBLIC_VAPID_PUBLIC_KEY").waitFor();
  const pub = await page.getByLabel("NEXT_PUBLIC_VAPID_PUBLIC_KEY").inputValue();
  const priv = await page.getByLabel("VAPID_PRIVATE_KEY").inputValue();
  const secret = await page.getByLabel("PUSH_WEBHOOK_SECRET").inputValue();
  ok(/^[A-Za-z0-9_-]{87}$/.test(pub) && /^[A-Za-z0-9_-]{43}$/.test(priv) && /^[0-9a-f]{64}$/.test(secret), "the setup page makes browser push keys and a webhook secret in the browser");
  await page.reload();
  await page.getByLabel("NEXT_PUBLIC_VAPID_PUBLIC_KEY").waitFor();
  ok((await page.getByLabel("PUSH_WEBHOOK_SECRET").inputValue()) !== secret, "…a new set every visit");
  ok((await page.locator('meta[name="robots"]').getAttribute("content"))?.includes("noindex"), "…and it's kept out of search engines");
  const sw = await (await fetch(BASE + "/sw.js")).text();
  ok(sw.includes('addEventListener("push"') && sw.includes('addEventListener("notificationclick"'), "the service worker shows pushes and opens their page");
  const send = await fetch(BASE + "/api/push/send", { method: "POST", body: "{}" });
  ok(send.status === 404, `sending is off until the webhook secret is set (${send.status})`);
  const health = await (await fetch(BASE + "/api/health")).json();
  ok(health.checks.push_notifications.note.startsWith("Off (optional)"), "the setup check says how to turn notifications on");
});

await run("browse", desktop, async (page) => {
  await go(page, "/browse");
  ok((await page.locator("main article").count()) === 4, "browse shows 4 apps");
  ok((await page.locator("main article a[href^='/try/'][href$='via=card']").count()) === 4, "each app on Browse is a row with its own Try button");
  ok((await page.locator("main article [data-app-logo]").count()) === 4, "…and its logo");
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
  ok((await page.locator("#discuss").getByRole("link", { name: /^Comments/ }).count()) === 0, "no comments tab: talking about an app happens in Q&A");
  ok(await page.locator("#qa").isVisible(), "Q&A is the first tab");
  ok((await page.locator("#qa").getByRole("link", { name: "Leave feedback" }).getAttribute("href")) === "#feedback", "Q&A points to the feedback area");
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
  ok(await page.getByRole("heading", { name: "Parkside Labs" }).isVisible(), "profile heading");
  ok((await page.getByText("Open to collab").count()) === 1 && (await page.locator("main .tag-accent", { hasText: "Open to collab" }).isVisible()), "status shows once, as the badge by the avatar");
  ok(await page.locator("main").getByText("Founder", { exact: true }).isVisible(), "other role tags still shown");
  ok((await page.locator("main article").count()) === 2, "profile lists their 2 apps");
  ok((await page.locator("main article [data-app-logo]").count()) === 2, "…as banner cards with each app's logo, like Home");
  const drops = page.getByRole("list", { name: "Drops" }).getByRole("link");
  ok((await drops.count()) === 2, "profile shows their 2 Drops");
  ok(/^\/drops\?d=/.test((await drops.first().getAttribute("href")) ?? ""), "a Drop opens the feed on it");
  const dropsTop = (await page.getByRole("heading", { name: /^Drops/ }).boundingBox()).y;
  const appsTop = (await page.getByRole("heading", { name: /^Apps/ }).boundingBox()).y;
  const passportTop = (await page.getByText("Tester passport", { exact: false }).first().boundingBox()).y;
  ok(dropsTop < appsTop && appsTop < passportTop, "Drops come first, then apps, then the passport");
  await page.screenshot({ path: OUT + "profile-desktop.png", fullPage: true });
});

await run("open the feed on one Drop", phone, async (page) => {
  await go(page, "/drops?d=demo-drop-splitsy");
  ok((await page.locator("article").first().textContent()).includes("Splitsy"), "/drops?d= starts the feed on that Drop");
  ok((await page.locator("article").count()) === 4, "…with the rest of the feed after it, no repeats");
});

await run("drop bonus + spotlight", desktop, async (page) => {
  await go(page, "/submit");
  ok(await page.getByText(/Post a Drop, get \+/).isVisible(), "the Post screen shows the post-a-Drop bonus while it runs (Home pops it up)");
  await go(page, "/apps/noteflow");
  ok(await page.locator("#spotlight").getByRole("heading", { name: /Spotlight: get on Featured/ }).isVisible(), "the Spotlight box says what it's for and can be linked to");
});

await run("manage an app", desktop, async (page) => {
  await go(page, "/apps/noteflow/manage");
  for (const h of ["Drops", "Details", "Link", "Card image", "Delete this app"]) {
    ok(await page.getByRole("heading", { name: new RegExp(`^${h}`) }).first().isVisible(), `Manage has ${h}`);
  }
  ok((await page.getByRole("textbox", { name: "Name" }).inputValue()) === "NoteFlow", "details are filled in");
  ok(await page.getByText("+ Add a Drop").isVisible(), "you can add a Drop");
  ok(await page.getByRole("button", { name: "Delete Drop" }).isVisible(), "…and delete one");
  await page.getByRole("button", { name: "Save details" }).click();
  await page.getByText(/demo mode/i).nth(1).waitFor();
  ok(true, "saving in demo mode explains itself");
  await page.getByRole("button", { name: "Delete app…" }).click();
  const del = page.getByRole("button", { name: "Delete forever" });
  ok(await del.isDisabled(), "deleting needs the app's name typed first");
  await page.getByRole("textbox", { name: /to confirm/ }).fill("noteflow");
  ok(await del.isEnabled(), "…then it can go");
  await noSideScroll(page, "manage");
});

{
  const ctx = await browser.newContext();
  await bonusSeen(ctx);
  const page = await ctx.newPage();
  const res = await go(page, "/u/nobody_here");
  ok(res.status() === 404, "unknown profile is 404");
  ok(await page.getByRole("heading", { name: "Nothing here" }).isVisible(), "404s show Method V's own not-found page");
  ok(await page.locator("header").getByRole("link", { name: "Method V home" }).isVisible(), "with the menu, so people can find their way back");
  await ctx.close();
}

await run("launch days + boosts", desktop, async (page) => {
  await go(page, "/");
  const featured = page.getByRole("region", { name: "In the Spotlight" });
  const labels = (await featured.locator("article .spot-label").allTextContents()).filter((l) => /Spotlight|pick|Launch/.test(l));
  ok(labels[0]?.includes("Spotlight"), `the paid Spotlight app has the top spot (${labels.join(" | ")})`);
  ok((await featured.locator("article .spot-gold").count()) === 1 && (await featured.locator("article .spot-glass").count()) === 3, "paid wears gold, Today's picks wear glass");
  ok(labels.slice(1).length === 3 && labels.slice(1).every((l) => l.includes("Today's pick")), `the other spots are random daily picks (${labels.join(" | ")})`);
  await go(page, "/browse");
  const soon = page.getByRole("region", { name: "Upcoming launches" });
  ok((await soon.locator("li").count()) === 1 && (await soon.textContent()).includes("QuizPop"), "Launching soon lists QuizPop");
  ok(/2d [34]h/.test(await soon.locator("time").textContent()), `countdown shows days and hours (${await soon.locator("time").textContent()})`);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: OUT + "browse-launches.png", fullPage: true });

  await go(page, "/apps/quizpop");
  ok(await page.getByText(/^Launching in/).first().isVisible(), "app page shows the launch countdown");
  ok(await page.locator(".tag-accent", { hasText: "Spotlight" }).isVisible(), "app page shows it's in the Spotlight");
  const grow = page.getByRole("region", { name: "Grow" });
  ok(await grow.getByText("Builder tools · preview in demo mode").isVisible(), "Grow panel preview in demo mode");
  ok(await grow.getByText(/is in the Spotlight for another/).isVisible(), "Grow panel counts down the Spotlight");
  ok((await grow.getByRole("button", { name: /Book the Spotlight/ }).count()) === 0, "no second booking while it's on");

  await go(page, "/apps/splitsy");
  ok(await page.getByRole("region", { name: "Grow" }).getByText("It's launch day!").isVisible(), "launch-day state on the app page");
  await go(page, "/apps/noteflow");
  const growNote = page.getByRole("region", { name: "Grow" });
  ok(await growNote.getByLabel("Launch date and time").isVisible(), "unscheduled app offers a launch date picker");
  ok(await growNote.getByText("A spot is free: it starts right away.").isVisible(), "Spotlight says when it would start");
  await growNote.getByRole("button", { name: "Book the Spotlight · 25" }).click();
  await growNote.getByText("Method V is running in demo mode").waitFor({ timeout: 5000 });
  ok(true, "booking the Spotlight explains demo mode");
  await growNote.screenshot({ path: OUT + "grow-panel.png" });
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

await run("footer", phone, async (page) => {
  await go(page, "/");
  const footer = page.locator("footer");
  ok((await footer.locator("svg.pc-animated, .pc-dust, .bot-eyes").count()) === 0, "no animated pixel art in the footer (off for now)");
  ok((await page.locator("header svg.pc-animated").count()) === 0, "no pixel coder next to the logo at the top");
  ok((await page.getByText(/Then try it/i).count()) === 0, "the old tagline is gone");
  const footerLinks = await footer.locator("a").allTextContents();
  ok(footerLinks.join(",") === "Terms,Privacy,Contact", `footer only has the Terms, Privacy and Contact links (${footerLinks.join(", ")})`);
  ok(await footer.getByText("Method", { exact: false }).first().isVisible(), "footer shows the Method V logo");
  ok(await footer.getByText("Show off your app. Get real feedback. Get traction.").isVisible(), "the tagline is under the footer logo");
  {
    const logo = await footer.locator(".wordmark-v").first().boundingBox();
    const tag = await footer.getByText("Show off your app. Get real feedback. Get traction.").boundingBox();
    ok(tag.y > logo.y + logo.height - 2, "tagline sits right under the logo");
  }
  ok((await page.title()).includes("Show off your app. Get real feedback. Get traction."), "and in the browser tab title");
  await go(page, "/drops");
  ok((await page.locator("footer").count()) === 0, "no footer under the full-screen Drops feed");
  await go(page, "/browse");
  ok((await page.getByRole("navigation", { name: "More on Method V" }).count()) === 0, "no More on Method V row on Browse");
});

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
  ok((await discussion.getByRole("link", { name: /Q&A/ }).getAttribute("aria-current")) === "page", "Q&A is the default tab");
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
  ok((await passport.getByRole("list", { name: "Categories tested" }).locator("li").count()) === 8, "8 of 10 category stamps filled");
  ok((await passport.getByText("Still to collect: Dev tools · Other").isVisible()), "the rest are listed to collect");
  ok((await passport.getByRole("list", { name: "Ranks" }).locator('li[aria-current="step"]').textContent()) === "Pro", "the rank ladder marks where you are");
  await passport.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await passport.screenshot({ path: OUT + "passport.png" });
  await go(page, "/test");
  const top = page.getByRole("region", { name: "Top testers" });
  ok((await top.locator("li").count()) === 3, "top testers board lists testers");
  ok((await top.locator("li").first().textContent()).includes("Díaz Digital"), "most helpful tester is first");
});

await run("login", phone, async (page) => {
  await go(page, "/login");
  ok(await page.getByLabel("Password", { exact: true }).isVisible(), "sign in with email and password");
  ok((await page.locator("header").getByRole("link", { name: "Sign in" }).count()) === 0, "no Sign in button up top on the sign-in page");
  ok(await page.getByRole("button", { name: "Sign in", exact: true }).isDisabled(), "sign-in disabled in demo mode");
  await page.getByRole("tab", { name: "Create account" }).click();
  ok((await page.getByRole("tab", { name: "Create account" }).getAttribute("aria-selected")) === "true", "switch to Create account");
  ok((await page.getByLabel("Password", { exact: true }).getAttribute("autocomplete")) === "new-password", "new accounts get a new-password field");
  ok(await page.getByRole("button", { name: "Create account", exact: true }).isVisible(), "Create account button");
  const agree = page.getByRole("checkbox", { name: /I'm at least 13 and I agree to the Terms of Service and Privacy Policy/ });
  ok((await agree.isVisible()) && (await agree.getAttribute("required")) !== null, "new accounts must tick the Terms box");
  ok(!(await agree.isChecked()), "the Terms box starts unticked");
  await page.getByRole("tab", { name: "Sign in" }).click();
  ok((await page.getByRole("checkbox").count()) === 0, "signing in doesn't ask again");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByRole("button", { name: "Forgot your password? Email me a sign-in link" }).click();
  ok(await page.getByRole("button", { name: "Email me a sign-in link" }).isDisabled(), "emailed link is still there as the fallback");
  ok((await page.getByLabel("Password", { exact: true }).count()) === 0, "the link option needs no password");
  await noSideScroll(page, "login");
  await go(page, "/browse");
  ok(await page.locator("header").getByRole("link", { name: "Sign in" }).isVisible(), "other pages still have Sign in up top");
  await go(page, "/login?mode=signup");
  ok((await page.getByRole("tab", { name: "Create account" }).getAttribute("aria-selected")) === "true", "?mode=signup opens on Create account");
  ok(await page.getByRole("link", { name: /New here\? See what Method V is/ }).isVisible(), "sign-in page links to what Method V is");
});

for (const [label, size] of [
  ["phone", phone],
  ["desktop", desktop],
]) {
  await run(`landing page (${label})`, size, async (page) => {
    await go(page, "/about");
    ok(await page.getByRole("heading", { level: 1, name: "Show off what you built. Get real people to try it." }).isVisible(), "explains what it is first");
    const join = page.getByRole("link", { name: "Join free" }).first();
    ok((await join.getAttribute("href")) === "/login?mode=signup", "Join free goes to Create account");
    await page.getByRole("link", { name: "See how it works ↓" }).click();
    const how = page.getByRole("region", { name: "Three steps to your first real users" });
    ok((await how.locator("li").count()) === 3, "how it works in three steps");
    ok((await page.getByRole("region", { name: "In the Spotlight" }).count()) === 0, "no Spotlight before signing in");
    ok((await page.getByText(/NoteFlow|QuizPop|PalettePal|Splitsy/).count()) === 0, "no real apps before signing in");
    ok((await page.getByRole("link", { name: "Join free to look inside" }).getAttribute("href")) === "/login?mode=signup", "members-only teaser asks them to join");
    const faq = page.getByRole("region", { name: "Questions" });
    await faq.getByText("Is it free?").click();
    ok(await faq.getByText(/Posting your app, trying apps/).isVisible(), "FAQ answers open");
    await noSideScroll(page, `landing ${label}`);
    await page.screenshot({ path: `${OUT}landing-${label}.png`, fullPage: true });
  });
}

await run("followers and following", phone, async (page) => {
  await go(page, "/u/ada_builds");
  await page.getByRole("link", { name: /followers$/ }).first().click();
  await page.waitForURL(/\/u\/ada_builds\/followers$/);
  ok(await page.getByRole("heading", { level: 1, name: /followers/ }).isVisible(), "the followers count opens the list");
  const rows = page.locator("main ul li, ul.divide-y li");
  ok((await rows.count()) > 0, `people are listed (${await rows.count()})`);
  ok((await page.getByRole("button", { name: /Follow/ }).count()) > 0, "each person has a Follow button");
  await page.getByRole("link", { name: "Following", exact: true }).click();
  await page.waitForURL(/\/following$/);
  ok(await page.getByRole("heading", { level: 1, name: /follows/ }).isVisible(), "switches to who they follow");
  await noSideScroll(page, "following");
  ok((await fetch(BASE + "/u/nobody_here_123/followers")).status === 404, "an unknown person's list is a 404");
});

await run("email link outcomes", phone, async (page) => {
  await go(page, "/login?confirmed=1");
  ok(await page.getByText("Your email is confirmed.").isVisible(), "a link opened in another browser says the email is confirmed");
  await go(page, "/login?error=expired");
  ok(await page.getByText("That link was already used or has expired.").isVisible(), "an old link says so, and what to do");
  const res = await page.goto(BASE + "/auth/callback");
  ok(new URL(page.url()).pathname === "/login" && res.status() < 400, "a bare callback goes back to sign-in");
});

await run("set up your profile", phone, async (page) => {
  await go(page, "/welcome");
  ok(await page.getByRole("heading", { name: "Set up your profile" }).isVisible(), "the first-sign-in page asks for a profile");
  const box = page.getByRole("textbox", { name: /Username/ });
  ok((await box.inputValue()) !== "", "a username is suggested");
  await box.fill("No Spaces!");
  ok((await box.inputValue()) === "no_spaces!", "typing is lowercased, spaces become _");
  await page.getByText(/Usernames are 3–24 characters/).first().waitFor();
  ok(await page.getByRole("button", { name: "Save and continue" }).isDisabled(), "a bad username can't be saved");
  ok(await page.getByRole("button", { name: "Add a photo" }).isVisible(), "a photo is offered");
  ok(await page.getByText("Optional, but recommended.").isVisible(), "…as optional, but recommended");
  ok(await page.getByRole("heading", { name: "Want notifications?" }).isVisible(), "it asks about notifications");
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.waitForURL((u) => new URL(u).pathname === "/");
  ok(true, "Skip for now goes on to Home");
});

await run("terms and privacy", phone, async (page) => {
  await go(page, "/login");
  const agree = page.getByText("By signing in or creating an account, you agree to our");
  ok(await agree.getByRole("link", { name: "Terms of Service" }).isVisible(), "sign-in page links the Terms");
  ok(await agree.getByRole("link", { name: "Privacy Policy" }).isVisible(), "sign-in page links the Privacy Policy");
  const legal = page.getByRole("navigation", { name: "Legal" });
  ok((await legal.getByRole("link", { name: "Terms" }).getAttribute("href")) === "/terms", "footer links the Terms");
  ok((await legal.getByRole("link", { name: "Contact" }).getAttribute("href")) === "mailto:team@methodv.app", "footer has a contact email");

  // The one-time agree screen for Google/Apple/GitHub sign-ups (the gate itself is unit tested).
  await go(page, "/agree");
  ok(await page.getByRole("heading", { level: 1, name: "One more step" }).isVisible(), "agree screen");
  const agreeBtn = page.getByRole("button", { name: "Agree and continue" });
  ok(await agreeBtn.isDisabled(), "Agree and continue waits for the box");
  await page.getByRole("checkbox", { name: /agree to the Terms of Service and Privacy Policy/ }).check();
  ok(await agreeBtn.isEnabled(), "ticking the box turns on Agree and continue");
  ok((await page.getByRole("link", { name: "Terms of Service" }).first().getAttribute("href")) === "/terms", "agree screen links the Terms");
  await noSideScroll(page, "agree");

  await go(page, "/terms");
  ok(await page.getByRole("heading", { level: 1, name: "Terms of Service" }).isVisible(), "Terms page");
  for (const s of ["5. Methodium", "7. Tips, sponsorships and payouts"]) ok(await page.getByRole("heading", { name: s }).isVisible(), `Terms covers ${s}`);
  ok(await page.getByText("12% of sponsorship packages (7% with Pro)").isVisible(), "Terms states the real fees");
  await noSideScroll(page, "terms");

  await go(page, "/privacy");
  ok(await page.getByRole("heading", { level: 1, name: "Privacy Policy" }).isVisible(), "Privacy page");
  ok(await page.getByText("we don't sell your data", { exact: false }).first().isVisible(), "Privacy says we don't sell data");
  await noSideScroll(page, "privacy");
});

await run("submit", desktop, async (page) => {
  await go(page, "/submit");
  ok(await page.getByText(/You can post 3 new apps every 30 days \(3 left\)/).isVisible(), "the Post page says the limit: 3 new apps every 30 days");
  const input = page.getByLabel("Drop video");
  await input.setInputFiles(CLIPS + "clip-62s.webm");
  await page.getByText(/Drops can be up to 60 seconds/).waitFor({ timeout: 15000 });
  ok(true, "62-second video is rejected");
  await input.setInputFiles(CLIPS + "clip-landscape.webm");
  await page.getByText(/^0:0\d ·/).waitFor({ timeout: 15000 });
  const wideBox = await page.getByLabel("Your Drop", { exact: true }).boundingBox();
  ok(wideBox.width > wideBox.height, `a horizontal (16:9) video is accepted and previews wide (${Math.round(wideBox.width)}×${Math.round(wideBox.height)})`);
  ok(await page.getByText(/vertical \(9:16\) or horizontal \(16:9\)/).isVisible(), "the post page says both shapes work");
  await input.setInputFiles(CLIPS + "clip-20s.webm");
  await page.getByText(/^0:20 ·/).waitFor({ timeout: 15000 });
  ok(true, "20-second video is accepted and shows 0:20");
  ok(await page.getByText("Still need: your link, a name, a tagline, a category, the safety check.").isVisible(), "tells you what's still needed");
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
  // Optional cover image for the app's card.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.getByLabel("Cover image").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: png });
  ok(await page.getByRole("img", { name: "Your cover image" }).isVisible(), "an optional cover image previews before posting");
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  ok((await page.getByRole("img", { name: "Your cover image" }).count()) === 0, "…and can be removed");
  const safety = page.getByRole("region", { name: "Safety check" });
  ok((await safety.locator("li").count()) === 5 && (await safety.getByText("Your database is locked down").isVisible()), "a quick safety checklist before posting");
  ok(await page.getByText("Still need: the safety check.").isVisible(), "posting waits for the safety box");
  await safety.getByRole("checkbox", { name: /mine to share/ }).check();
  ok(!(await page.getByText(/^Still need/).count()), "nothing missing once the basics are in");
  await page.getByRole("button", { name: "Post Drop" }).click();
  ok(await page.locator("form p.rounded-lg", { hasText: "Method V is running in demo mode" }).isVisible(), "posting explains demo mode");
  await page.screenshot({ path: OUT + "submit-desktop.png", fullPage: true });
});

await run("test & earn", desktop, async (page) => {
  await go(page, "/test");
  ok(await page.getByRole("heading", { name: "Test & earn" }).isVisible(), "Test & earn page loads");
  ok(await page.getByRole("heading", { name: "Open bounties" }).isVisible() && (await page.locator("main article").filter({ has: page.getByRole("heading", { level: 3 }) }).count()) >= 1, "Test & earn lists open bounties");
  ok((await page.getByText(/spots? left|waiting for testers/i).count()) === 0, "no tester spots anywhere");
  ok((await page.getByRole("link", { name: "Give feedback →" }).count()) > 0, "new apps to give free feedback on");
  await page.getByRole("link", { name: "Give feedback →" }).first().click();
  await page.waitForURL(/\/apps\/.+#feedback/);
  ok(await page.locator("#feedback").getByText("off in demo mode").isVisible(), "feedback panel explains demo mode");
  const panel = page.locator("#feedback");
  ok(await panel.getByRole("heading", { name: "Feedback" }).isVisible() && (await panel.locator("ol li").count()) === 3, "the app page explains feedback in 3 steps");
  ok((await page.getByRole("button", { name: /testers/ }).count()) === 0, "nothing on the app page sells testers");
  const below = await page.evaluate(() => {
    const d = document.querySelector("main p.leading-relaxed");
    const f = document.getElementById("feedback");
    return Boolean(d && f && d.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING && f.getBoundingClientRect().top - d.getBoundingClientRect().bottom < 60);
  });
  ok(below, "feedback sits right under the app's description");
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
  ok(await page.getByText("How Methodium works").isVisible(), "credits page explains the rules");
  const buy = page.getByRole("region", { name: "Buy Methodium" });
  const packs = (await buy.locator("li button").allTextContents()).map((t) => t.replace(/\s+/g, " "));
  ok(packs.length === 3 && packs[0].includes("25") && packs[0].includes("$5") && packs[2].includes("$20"), `three credit packs (${packs.join(" | ")})`);
  await buy.locator("li button").first().click();
  await buy.locator(".text-danger").waitFor({ timeout: 5000 });
  ok(true, `buying explains what's missing (${await buy.locator(".text-danger").textContent()})`);
  await noSideScroll(page, "credits with packs");
});

await run("+ opens the camera/library", phone, async (page) => {
  await go(page, "/");
  const plus = page.getByRole("navigation", { name: "Main" }).getByLabel("Post your project");
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

  const sponsor = page.getByRole("region", { name: "Sponsor", exact: true });
  const jump = page.getByRole("link", { name: "Sponsor this app" });
  ok((await jump.getAttribute("href")) === "#sponsor", "a Sponsor this app button sits by Try it");
  await jump.click();
  await page.waitForTimeout(300);
  ok(await sponsor.getByRole("heading").first().isVisible(), "it jumps to the packages");
  const packs = (await sponsor.locator("li button").allTextContents()).join(" | ");
  ok((await sponsor.locator("li button").count()) === 2 && packs.includes("$25") && packs.includes("$80"), `the builder's packages show with their prices (${packs})`);
  await sponsor.getByRole("button", { name: /Video promo/ }).click();
  await sponsor.getByLabel("Brief for the builder").fill("Mention the free trial");
  await sponsor.getByRole("button", { name: "Pay $80" }).click();
  await sponsor.getByText(/demo mode/i).waitFor();
  ok(true, "sponsoring a package explains demo mode");
  const editor = page.getByRole("region", { name: "Sponsorship packages" });
  ok((await editor.locator("ul > li").count()) === 5, "builders get all five packages to price and switch on");
  await editor.getByRole("button", { name: "Turn on" }).first().click();
  await editor.getByText(/demo mode/i).first().waitFor();
  ok(true, "saving a package explains demo mode");
  await page.screenshot({ path: `${OUT}app-earn-desktop.png`, fullPage: true });

  await go(page, "/apps/noteflow");
  ok((await page.getByRole("complementary", { name: "Sponsored" }).count()) === 0, "unsponsored apps show no card");
});

await run("drops feed buttons (phone)", phone, async (page) => {
  await go(page, "/drops");
  // The like and Q&A buttons sit above the caption's shading: nothing covers or blocks them.
  const covered = await page.evaluate(() =>
    ["Like", "Q&A"].map((label) => {
      const el = document.querySelector(`[aria-label="${label}"]`);
      if (!el) return `${label}: missing`;
      const b = el.getBoundingClientRect();
      const points = [[0.5, 0.5], [0.5, 0.9], [0.5, 0.1]].map(([x, y]) => document.elementFromPoint(b.left + b.width * x, b.top + b.height * y));
      return points.every((p) => p && (p === el || el.contains(p))) ? null : `${label}: covered`;
    }).filter(Boolean),
  );
  ok(covered.length === 0, `like and Q&A buttons are on top (${covered.join(", ") || "yes"})`);
  ok((await page.getByRole("link", { name: "Q&A" }).first().getAttribute("href"))?.endsWith("?tab=qa#discuss"), "the Q&A button opens the app's Q&A");
});

await run("drops feed sponsor (phone)", phone, async (page) => {
  await go(page, "/drops");
  const sponsored = page.locator("article a[href^='/try/noteflow?s=']");
  ok((await sponsored.count()) === 1, "the sponsored Drop carries one Sponsored card");
  ok((await sponsored.textContent()).includes("Sponsored"), "the feed card is labeled Sponsored");
});

await run("v store (phone)", phone, async (page) => {
  await go(page, "/earn");
  ok(new URL(page.url()).pathname === "/store", "old Earn links open the V Store");
  ok(await page.getByRole("heading", { name: "V Store", level: 1 }).isVisible(), "the V Store has its heading");
  const featured = page.getByRole("region", { name: "Featured" });
  const tiles = await featured.getByRole("button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  // Demo mode previews the store as Ada, who has Pro, so the Spotlight is 15.
  ok(tiles.join(" | ") === "Method V Pro, 50 Methodium | The Spotlight, 15 Methodium | Extra app post, 15 Methodium", `featured items: Pro, Spotlight, extra post (${tiles.join(" | ")})`);
  const community = await page.getByRole("region", { name: "Spend it on the community" }).getByRole("link").allTextContents();
  ok(community.length === 3 && !community.join(" ").includes("Testers"), `3 community tiles, none selling testers (${community.length})`);
  ok((await page.getByText(/guaranteed testers/i).count()) === 0, "the store never promises testers");
  // Each tile has a picture of the item (drawn shapes, not a big symbol).
  const art = await page.locator(".shop-tile svg.shop-art").evaluateAll((els) => els.map((el) => el.querySelectorAll("path, polygon, rect, circle").length));
  ok(art.length === 6 && art.every((n) => n >= 2), `all 6 tiles show a picture (${art.join(",")} shapes)`);
  await noSideScroll(page, "v store");
  await page.screenshot({ path: `${OUT}store-phone.png`, fullPage: true });
  await featured.getByRole("button", { name: /The Spotlight/ }).click();
  const dialog = page.getByRole("dialog", { name: "The Spotlight" });
  ok(await dialog.isVisible(), "tapping a tile opens the item");
  await dialog.getByRole("button", { name: /Book it/ }).click();
  await dialog.getByRole("button", { name: "Spend 15 Methodium" }).click();
  await dialog.getByText(/Add your Supabase keys/).waitFor({ timeout: 10_000 });
  ok(true, "buying asks to confirm, then explains demo mode");
  await page.keyboard.press("Escape");
  ok((await page.getByRole("dialog").count()) === 0, "Escape closes the item");
  await featured.getByRole("button", { name: /Extra app post/ }).click();
  ok(await page.getByRole("dialog", { name: "Extra app post" }).getByText(/You have 0 saved/).isVisible(), "the extra post shows how many are saved");
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  ok(await page.getByText(/demo mode, so there/).isVisible(), "earnings below the shop explain demo mode");
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

await run("email templates page", desktop, async (page) => {
  await go(page, "/setup/emails");
  ok((await page.locator("main ol > li").count()) === 6, "six emails to paste into Supabase");
  ok((await page.locator('iframe[title="Magic link preview"]').count()) === 1, "each one has a preview");
  ok((await page.locator('meta[name="robots"]').getAttribute("content"))?.includes("noindex"), "setup page isn't indexed");
});

await run(
  "drop bonus pop-up (phone)",
  phone,
  async (page) => {
    await go(page, "/");
    const pop = page.getByRole("dialog", { name: "Post a Drop, get +10 Methodium" });
    await pop.waitFor({ timeout: 5000 });
    ok(true, "the Drop bonus pops up on Home");
    ok((await page.getByText("🎉 Post a Drop", { exact: false }).count()) === 0, "no banner on Home any more");
    ok((await pop.getByRole("link", { name: "Post a Drop →" }).getAttribute("href")) === "/submit", "its button goes to the post page");
    await noSideScroll(page, "drop bonus pop-up");
    await page.screenshot({ path: `${OUT}drop-bonus-popup.png` });
    await pop.getByRole("button", { name: "Close" }).click();
    ok((await pop.count()) === 0, "✕ closes it");
    await page.reload();
    await page.waitForTimeout(1200);
    ok((await pop.count()) === 0, "and it stays closed");
    await page.evaluate(() => localStorage.clear());
    await go(page, "/?tour=1");
    const tour = page.getByRole("dialog", { name: "Tour" });
    await tour.waitFor({ timeout: 5000 });
    await page.waitForTimeout(1200);
    ok((await pop.count()) === 0, "never on top of the tour");
    await tour.getByRole("button", { name: "Skip tour" }).click();
    await pop.waitFor({ timeout: 5000 });
    ok(true, "shows once the tour is done");
    await pop.getByRole("link", { name: "Post a Drop →" }).click();
    await page.waitForURL("**/submit");
    ok(true, "Post a Drop opens the post page");
    await go(page, "/");
    await page.waitForTimeout(1200);
    ok((await pop.count()) === 0, "not again after posting from it");
  },
  { popups: true },
);

await run("Methodium: bounties, perks, tips, invites", desktop, async (page) => {
  await go(page, "/apps/noteflow");
  const bounties = page.getByRole("region", { name: "Bounties" });
  ok(await bounties.getByText("Find a bug in the to-do export").isVisible(), "app pages show their bounties");
  ok((await bounties.getByText("9 days left · 3 answers").count()) === 1, "with time left and how many answered");
  await bounties.getByRole("button", { name: "Answer it" }).click();
  const answer = bounties.getByRole("form", { name: "Answer the bounty" });
  ok(await answer.getByRole("button", { name: "Send answer" }).isDisabled(), "a too-short answer can't be sent");
  await answer.getByLabel("Your answer").fill("Exporting to Linear drops every to-do after the first one.");
  await answer.getByRole("button", { name: "Send answer" }).click();
  await bounties.getByText(/demo mode/i).first().waitFor({ timeout: 5000 });
  ok(true, "answering explains demo mode");
  await bounties.getByRole("button", { name: "+ Post a bounty" }).click();
  ok(await bounties.getByRole("form", { name: "Post a bounty" }).getByRole("button", { name: /Post · hold 20 Methodium/ }).isVisible(), "builders post a bounty, holding the reward");

  const perks = page.getByRole("region", { name: "Perks" });
  ok(await perks.getByText("3 months of NoteFlow Pro").isVisible() && (await perks.getByText("38 of 50 left").count()) === 1, "app pages show perks and how many are left");
  await perks.getByRole("button", { name: /Unlock/ }).click();
  await perks.getByRole("button", { name: "Spend 30 Methodium" }).click();
  await perks.getByText(/demo mode/i).first().waitFor({ timeout: 5000 });
  ok(true, "unlocking asks to confirm, then explains demo mode");
  await perks.getByRole("button", { name: "+ Add a perk" }).click();
  ok(await perks.getByRole("form", { name: "Add a perk" }).getByText("Only shown to people who unlock it.").isVisible(), "builders add a perk with a private code");

  await page.getByRole("button", { name: /Tip the builder/ }).click();
  const tip = page.getByRole("group", { name: "Tip @ada_builds" });
  await tip.getByRole("button", { name: "10" }).click();
  ok(await tip.getByRole("button", { name: "Send 10 Methodium" }).isVisible(), "tip the builder, picking an amount");

  await go(page, "/credits");
  const invite = page.getByRole("region", { name: /Invite friends/ });
  ok((await invite.getByLabel("Your invite link").textContent()).includes("/?ref="), "the Methodium page has your invite link");
  ok((await page.getByRole("region", { name: "Bounties: earn bigger" }).locator("article").count()) === 3, "open bounties across Method V");
  const rewards = await page.getByRole("region", { name: "Bounties: earn bigger" }).locator("article .tag-accent").allTextContents();
  ok(rewards.map((r) => Number(r.replace(/\D/g, ""))).join(",") === "40,25,10", `biggest rewards first (${rewards.join(",")})`);
  ok((await page.getByRole("region", { name: "Perks: spend it on real deals" }).locator("article").count()) === 3, "perks to unlock across Method V");
  await noSideScroll(page, "credits");
});

await run("first-time tour", desktop, async (page) => {
  await go(page, "/");
  await page.waitForTimeout(900);
  ok((await page.getByRole("dialog", { name: "Tour" }).count()) === 0, "no tour for signed-out visitors unless asked");
  await go(page, "/?tour=1");
  const tour = page.getByRole("dialog", { name: "Tour" });
  await tour.getByRole("heading", { name: "Welcome to Method V" }).waitFor({ timeout: 5000 });
  ok(true, "the tour opens with a welcome");
  await tour.getByRole("button", { name: "Start the tour" }).click();
  ok(await tour.getByRole("heading", { name: "Featured" }).isVisible(), "step 1 points at Featured");
  ok((await tour.locator("[data-tour-highlight]").count()) === 1, "and highlights it on the page");
  await page.screenshot({ path: OUT + "tour-featured.png" });
  const titles = [];
  for (let i = 0; i < 6; i++) {
    await tour.getByRole("button", { name: "Next" }).click();
    titles.push(await tour.getByRole("heading").textContent());
  }
  ok(titles.join(" > ") === "Drops > Post your app > Browse > Methodium > Your inbox > Your profile", `walks through the site (${titles.join(" > ")})`);
  await tour.getByRole("button", { name: "Back" }).click();
  ok((await tour.getByRole("heading").textContent()) === "Your inbox", "Back goes back a step");
  await page.keyboard.press("ArrowRight");
  await tour.getByRole("button", { name: "Next" }).click();
  ok(await tour.getByRole("link", { name: "Find apps to test" }).isVisible(), "ends with where to start");
  await tour.getByRole("button", { name: "Close" }).click();
  ok((await page.getByRole("dialog", { name: "Tour" }).count()) === 0 && new URL(page.url()).search === "", "closing it tidies the address");
});

await run("tour on a phone, skipped", phone, async (page) => {
  await go(page, "/?tour=1");
  const tour = page.getByRole("dialog", { name: "Tour" });
  await tour.getByRole("button", { name: "Start the tour" }).click();
  await tour.getByRole("button", { name: "Next" }).click();
  ok((await tour.getByRole("heading").textContent()) === "Drops", "phones get the same steps");
  const box = await tour.locator("[data-tour-highlight]").boundingBox();
  ok(box && box.y > 700, `Drops is highlighted in the bottom tab bar on phones (y=${Math.round(box?.y ?? 0)})`);
  await noSideScroll(page, "tour on a phone");
  await page.screenshot({ path: OUT + "tour-phone.png" });
  await tour.getByRole("button", { name: "Skip tour" }).click();
  ok((await page.getByRole("dialog", { name: "Tour" }).count()) === 0, "Skip tour closes it straight away");
});

await run("challenges (desktop)", desktop, async (page) => {
  await go(page, "/");
  ok((await page.getByRole("navigation").getByRole("link", { name: "Challenges" }).count()) === 0, "no Challenges tab in the menu");
  ok((await page.getByRole("region", { name: "Challenge" }).count()) === 0, "no challenge banner on Home until one is live");
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

await run("v store (desktop)", desktop, async (page) => {
  await go(page, "/store");
  const menu = await page.locator("header nav a").allTextContents();
  ok(menu.includes("V Store") && !menu.includes("Earn"), `the menu has V Store instead of Earn (${menu.join(", ")})`);
  const pro = await page.getByRole("button", { name: /Method V Pro/ }).boundingBox();
  const spot = await page.getByRole("button", { name: /The Spotlight/ }).boundingBox();
  ok(pro.height > spot.height * 1.6 && spot.x > pro.x + pro.width - 2, "Pro is the big featured tile, the upgrades sit beside it");
  const earnings = await page.getByRole("heading", { name: "Your earnings" }).boundingBox();
  const community = await page.getByRole("region", { name: "Spend it on the community" }).boundingBox();
  ok(earnings.y > community.y + community.height, "earnings sit below the store items");
  await page.screenshot({ path: `${OUT}store-desktop.png`, fullPage: true });
});

await run("phase 4 pages (phone)", phone, async (page) => {
  for (const path of ["/store", "/pro", "/challenges", "/challenges/build-for-teachers", "/apps/quizpop"]) {
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
  const appsRes = await fetch(BASE + "/api/v1/apps");
  ok(/no-store/.test(appsRes.headers.get("cache-control") ?? "") && /private/.test(appsRes.headers.get("cache-control") ?? ""), "API answers are never cached (members only)");
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
  ok(/Authorization/.test(pre.headers.get("access-control-allow-headers") ?? ""), "members can send their sign-in token");
  ok((await fetch(BASE + "/go/pixelhost", { redirect: "manual" })).status === 303, "brand links redirect");
  ok((await fetch(BASE + "/go/nope", { redirect: "manual" })).status === 404, "unknown brand is 404");
  {
    // Security headers on every page; the embeddable card keeps its own.
    const page0 = await fetch(BASE + "/login");
    const csp = page0.headers.get("content-security-policy") ?? "";
    ok(csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'"), "pages send a Content-Security-Policy");
    ok((page0.headers.get("strict-transport-security") ?? "").includes("max-age=63072000"), "pages send HSTS");
    ok((page0.headers.get("permissions-policy") ?? "").includes("geolocation=()"), "pages send a Permissions-Policy");
    ok(page0.headers.get("x-frame-options") === "DENY", "pages can't be framed");
    const embed = await fetch(BASE + "/embed/noteflow");
    ok((embed.headers.get("content-security-policy") ?? "").includes("frame-ancestors *") && !embed.headers.get("x-frame-options"), "the embed card can still be framed");
  }
  for (const path of ["/api/mobile/apps", "/api/mobile/preview", "/api/mobile/delete-account"]) {
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
