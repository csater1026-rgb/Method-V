import type { Metadata } from "next";
import Link from "next/link";

import { CREDITS, MAX_DROP_SECONDS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Show off what you built. Get real people to try it.",
  description:
    "Method V is where builders post their apps with a quick 60-second demo, and real people try them and tell you honestly what works. Free to join.",
};

// What a first-time visitor sees at methodv.app (signed out, the proxy shows
// this page for "/"), and anyone at /about: what Method V is, how it works,
// then the sign-up. Explaining first, asking second. It shows no real apps:
// those (the Spotlight, the feed, every app) are for members only.
export default function AboutPage() {

  return (
    <div className="w-full">
      {/* 1. What it is, in one look. */}
      <section className="media-dark stage relative overflow-hidden px-4 pt-14 pb-16 text-white sm:pt-20 sm:pb-24">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="eyebrow">For people who build apps</p>
            <h1 className="display rise mt-2 text-6xl leading-[0.95] sm:text-7xl lg:text-8xl">
              Show off what you built. Get real people to try it.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/85">
              Method V is where builders post their apps with a quick {MAX_DROP_SECONDS}-second demo. Real people try them and tell you
              honestly what works, what doesn&apos;t, and whether they&apos;d use it.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/login?mode=signup" className="btn-accent px-6 py-3 text-base">
                Join free
              </Link>
              <a href="#how" className="btn-ghost border-white/30 px-5 py-3 text-base text-white hover:border-white">
                See how it works ↓
              </a>
            </div>
            <p className="mt-3 text-sm text-white/65">
              Free to post, try apps and give feedback. Already a member?{" "}
              <Link href="/login" className="text-accent hover:underline">
                Sign in
              </Link>
            </p>
          </div>
          <PhonePreview />
        </div>
      </section>

      {/* 2. How it works, in three steps. */}
      <section id="how" aria-labelledby="how-title" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <p className="eyebrow">How it works</p>
        <h2 id="how-title" className="display mt-1 text-5xl">
          Three steps to your first real users
        </h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          <Step n={1} title="Post your app">
            Paste your link. We read your site (or your App Store / Google Play page) and fill in the name and description. Add a
            {" "}
            {MAX_DROP_SECONDS}-second demo video if you like: it&apos;s optional.
          </Step>
          <Step n={2} title="People try it">
            Your demo shows up in the Drops feed, a swipeable feed of app demos. One tap on <strong>Try it</strong> opens your real app.
          </Step>
          <Step n={3} title="Get honest feedback and grow">
            Testers tell you if they&apos;d use it, what worked and what confused them, with screenshots. Reply, improve, and pick up
            followers along the way.
          </Step>
        </ol>
      </section>

      {/* 3. What members get to see. No real apps here: they're for members only. */}
      <section aria-labelledby="inside-title" className="mx-auto max-w-6xl px-4 py-4">
        <div className="media-dark stage relative overflow-hidden rounded-2xl border border-[rgb(var(--stage-glow)/0.25)] px-6 py-12 text-center text-white">
          <p className="eyebrow">Members only</p>
          <h2 id="inside-title" className="display mt-1 text-5xl">
            See what people are building
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/80">
            The Spotlight, the Drops feed and every app on Method V are for members. Join free to watch the demos, try the apps and see
            who&apos;s in the Spotlight today.
          </p>
          <Link href="/login?mode=signup" className="btn-accent mt-6 inline-block px-6 py-3 text-base">
            Join free to look inside
          </Link>
        </div>
      </section>

      {/* 4. Not a builder? Still useful. */}
      <section aria-labelledby="testers-title" className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-6">
            <p className="eyebrow">For builders</p>
            <h2 className="display mt-1 text-4xl">Get seen, not buried</h2>
            <ul className="mt-3 flex flex-col gap-2 text-ink/90">
              <li>• A page for your app, a demo in the feed, and a profile that shows what you&apos;ve shipped.</li>
              <li>• Ask your users questions with one-tap polls.</li>
              <li>• Put your app in the Spotlight at the top of Home, or schedule a launch day.</li>
              <li>• Offer sponsorship packages and get paid to promote other apps.</li>
            </ul>
          </div>
          <div id="testers" className="rounded-2xl border border-line bg-surface p-6">
            <p className="eyebrow">For testers</p>
            <h2 className="display mt-1 text-4xl">Try new apps, earn Methodium</h2>
            <ul className="mt-3 flex flex-col gap-2 text-ink/90">
              <li>• Find apps before anyone else and help shape them.</li>
              <li>
                • Earn {CREDITS.feedbackReward} Methodium (Method V&apos;s credits) for each piece of real feedback in Test &amp; earn.
              </li>
              <li>• Spend them to get testers for your own app, or a Spotlight spot.</li>
              <li>• Build a Tester Passport: ranks and stamps that show you give useful feedback.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 5. The questions people ask first. */}
      <section aria-labelledby="faq-title" className="mx-auto max-w-3xl px-4 py-12">
        <h2 id="faq-title" className="display text-5xl">
          Questions
        </h2>
        <div className="mt-4 flex flex-col gap-3">
          <Faq q="Is it free?">
            Yes. Posting your app, trying apps and giving or getting feedback are free. Optional extras cost money: Pro (more stats and a
            cheaper Spotlight), Methodium packs, and sponsorships.
          </Faq>
          <Faq q="Do I need a demo video?">
            No. A {MAX_DROP_SECONDS}-second screen recording helps people get it fast and puts your app in the Drops feed, but you can post
            with just your link and add a video later.
          </Faq>
          <Faq q="What kinds of apps?">
            Websites, web apps and phone apps: paste a website, App Store or Google Play link. Finished, in beta, or just an early idea.
          </Faq>
          <Faq q="Who sees the feedback on my app?">
            Only you and the person who wrote it. Everyone else just sees the totals, like how many people would use it.
          </Faq>
          <Faq q="Is there a phone app?">
            The iPhone and Android app is on its way. Until then, the website works great on your phone, and you can add it to your Home
            Screen.
          </Faq>
        </div>
      </section>

      {/* 6. Now ask. */}
      <section className="media-dark stage px-4 py-16 text-center text-white">
        <h2 className="display text-5xl sm:text-6xl">Your app deserves real users.</h2>
        <p className="mx-auto mt-3 max-w-xl text-white/80">Join free in a minute. Post your app today and see what people think.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/login?mode=signup" className="btn-accent px-6 py-3 text-base">
            Join free
          </Link>
          <Link href="/login" className="btn-ghost border-white/30 px-5 py-3 text-base text-white hover:border-white">
            Sign in
          </Link>
        </div>
      </section>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-2xl border border-line bg-surface p-6">
      <span className="display text-5xl text-accent">0{n}</span>
      <h3 className="mt-2 text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-muted">{children}</p>
    </li>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-line bg-surface p-4 open:border-accent/60">
      <summary className="cursor-pointer list-none font-semibold">
        <span className="mr-2 inline-block text-accent transition group-open:rotate-90">›</span>
        {q}
      </summary>
      <p className="mt-2 text-muted">{children}</p>
    </details>
  );
}

// A phone showing a Drop in the feed: what the site looks like in use.
function PhonePreview() {
  return (
    <div aria-hidden className="mx-auto w-[230px] rotate-2 rounded-[44px] border-2 border-white/20 bg-black p-3 shadow-2xl sm:w-[290px]">
      <div className="relative aspect-[9/19] overflow-hidden rounded-[34px] bg-[#0f1b29]">
        <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_14px,rgb(var(--stage-glow)/0.08)_14px_16px)]" />
        <div className="absolute -right-10 -bottom-10 h-48 w-48 rounded-full bg-accent/25 blur-3xl" />
        <div className="absolute inset-x-0 top-0 flex justify-center gap-4 pt-6 font-mono text-[10px] tracking-wider text-white/60 uppercase">
          <span className="border-b-2 border-accent pb-0.5 text-white">For you</span>
          <span>Trending</span>
          <span>Questions</span>
        </div>
        <div className="absolute top-1/3 left-[7%] w-[70%] rounded-2xl bg-white p-3 text-[#0b1622] shadow-xl">
          <p className="text-[11px] font-bold">Your app here</p>
          <div className="mt-2 h-2 w-4/5 rounded bg-[#e5e7eb]" />
          <div className="mt-1.5 h-2 w-3/5 rounded bg-[#e5e7eb]" />
          <div className="mt-3 h-14 rounded-lg bg-gradient-to-br from-accent/60 to-[#0379d9]/60" />
        </div>
        <div className="absolute right-3 bottom-36 flex flex-col items-center gap-3 text-white">
          <span className="text-xl">♡</span>
          <span className="text-[10px]">233</span>
          <span className="text-xl">?</span>
          <span className="text-[10px]">Q&amp;A</span>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-16">
          <p className="display text-3xl text-white">Your app</p>
          <p className="text-[11px] text-white/80">A 60-second demo of what it does</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-accent-ink">Try it →</span>
            <span className="font-mono text-[10px] text-white/70">412 tries</span>
          </div>
        </div>
      </div>
    </div>
  );
}
