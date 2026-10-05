"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { bookSpotlight, buyStoreItem } from "@/app/actions";
import { APP_LIMIT } from "@/lib/app-limit";
import { SPOTLIGHT, V_STORE } from "@/lib/constants";
import type { ActionResult } from "@/lib/types";

import { Coin } from "./Coin";

type Props = {
  credits: number;
  proUntil: string | null;
  // null before the V Store SQL is run.
  store: { extraAppPosts: number; appPostsBought: number } | null;
  apps: { id: string; slug: string; name: string }[];
  spotlightCost: number;
  // How long until a Spotlight booked now would start, like "1d 4h" (null:
  // a spot is free now).
  spotlightWait: string | null;
};

type Rarity = "legendary" | "epic" | "rare" | "uncommon";

type Item = {
  id: "pro" | "app_post" | "spotlight";
  name: string;
  rarity: Rarity;
  tag: string;
  cost: number;
  art: Art;
  about: React.ReactNode;
  status: React.ReactNode;
  buy: string;
  done: string;
  off: string | null;
  action: (appId: string) => Promise<ActionResult>;
};

const RARITY_LABEL: Record<Rarity, string> = { legendary: "Legendary", epic: "Epic", rare: "Rare", uncommon: "Uncommon" };

// "until January 4" (demo mode's Pro never ends).
const proUntilText = (iso: string) =>
  new Date(iso).getFullYear() > 2090 ? "forever (demo)" : `until ${new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;

// The V Store as an item shop: glowing tiles colored by rarity, with pixel
// art, a slanted name banner and the price. Tapping a tile opens the item
// with its Buy button (and an app picker for the Spotlight).
export function VStore({ credits, proUntil, store, apps, spotlightCost, spotlightWait }: Props) {
  // proUntil is only passed while Pro is on.
  const pro = proUntil !== null;
  const postsLeft = store ? Math.max(V_STORE.appPost.perWindow - store.appPostsBought, 0) : 0;
  const [open, setOpen] = useState<Item["id"] | null>(null);

  const items: Item[] = [
    {
      id: "pro",
      name: "Method V Pro",
      rarity: "legendary",
      tag: pro ? `Pro ${proUntilText(proUntil!)}` : `${V_STORE.pro.days} days`,
      cost: V_STORE.pro.cost,
      art: CROWN,
      about: (
        <>
          Stats for 30 and 90 days, a pinned app on your profile, a Pro badge, and the Spotlight for {SPOTLIGHT.proCost} V Coin instead of{" "}
          {SPOTLIGHT.cost}. Lasts {V_STORE.pro.days} days, no subscription.{" "}
          <Link href="/pro" className="text-white underline">
            More about Pro
          </Link>
        </>
      ),
      status: pro ? (
        <>
          You&apos;re Pro {proUntilText(proUntil!)}. Buying adds {V_STORE.pro.days} more days.
        </>
      ) : null,
      buy: pro ? `Add ${V_STORE.pro.days} days` : "Get Pro",
      done: "You're Pro! It's on now.",
      off: null,
      action: () => buyStoreItem("pro"),
    },
    {
      id: "spotlight",
      name: "The Spotlight",
      rarity: "epic",
      tag: spotlightWait ? `Next spot in ${spotlightWait}` : "A spot is free now",
      cost: spotlightCost,
      art: STAR,
      about: (
        <>
          Put your app on the stage at the top of Home for {SPOTLIGHT.days} days. {SPOTLIGHT.slots} spots, first come, first served.
          {pro ? "" : ` ${SPOTLIGHT.proCost} V Coin with Pro.`}
        </>
      ),
      status: spotlightWait ? <>All spots are taken right now. Book now and you&apos;re next in line.</> : null,
      buy: "Book it",
      done: "Booked! Your app goes on the Spotlight (or is next in line).",
      off: apps.length === 0 ? "Post an app first, then put it in the Spotlight." : null,
      action: (appId) => bookSpotlight(appId, apps.find((a) => a.id === appId)?.slug ?? ""),
    },
    {
      id: "app_post",
      name: "Extra app post",
      rarity: "rare",
      tag: `Up to ${V_STORE.appPost.perWindow} a month`,
      cost: V_STORE.appPost.cost,
      art: WINDOW,
      about: (
        <>
          Post one more app past the limit of {APP_LIMIT.perWindow} every {APP_LIMIT.days} days. It&apos;s saved until you&apos;re at the
          limit, then used on your next app.
        </>
      ),
      status: store ? (
        <>
          You have {store.extraAppPosts} saved. {postsLeft} of {V_STORE.appPost.perWindow} left to buy this month.
        </>
      ) : null,
      buy: "Get an extra post",
      done: "Got it! It's saved until you need it.",
      off:
        store === null
          ? "The V Store needs the latest database update."
          : postsLeft === 0
            ? `You've bought ${V_STORE.appPost.perWindow} this month. More open up ${V_STORE.appPost.days} days after each one.`
            : null,
      action: () => buyStoreItem("app_post"),
    },
  ];
  const [featured, ...upgrades] = items;
  const current = items.find((i) => i.id === open) ?? null;

  return (
    <>
      <ShopSection title="Featured">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ShopTile item={featured} big className="col-span-2 lg:row-span-2" onOpen={() => setOpen(featured.id)} />
          {upgrades.map((item) => (
            <ShopTile key={item.id} item={item} className="lg:col-span-2" onOpen={() => setOpen(item.id)} />
          ))}
        </div>
      </ShopSection>

      <ShopSection title="Spend it on the community">
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {COMMUNITY.map((c) => (
            <li key={c.title}>
              <Link href={c.title === "Testers" ? (apps[0] ? `/apps/${apps[0].slug}#feedback` : "/submit") : c.href} className="shop-tile shop-uncommon group relative flex aspect-[4/5] flex-col overflow-hidden rounded-xl">
                <span className="shop-tag">{c.tag}</span>
                <span className="flex flex-1 items-center justify-center p-6">
                  <PixelArt art={c.art} className="shop-art w-[46%]" />
                </span>
                <span className="shop-banner">
                  <span className="display block text-2xl leading-none sm:text-3xl">{c.title}</span>
                  <span className="mt-1 block text-xs text-white/80">{c.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </ShopSection>

      {current && <ItemDialog item={current} credits={credits} apps={apps} onClose={() => setOpen(null)} />}
    </>
  );
}

function ShopSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="mt-8">
      <h2 className="display mb-3 inline-block -skew-x-6 text-4xl text-ink uppercase">{title}</h2>
      {children}
    </section>
  );
}

function ShopTile({ item, big = false, className = "", onOpen }: { item: Item; big?: boolean; className?: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${item.name}, ${item.cost} V Coin`}
      className={`shop-tile shop-${item.rarity} group relative flex flex-col overflow-hidden rounded-xl text-left ${big ? "min-h-[20rem] lg:min-h-[26rem]" : "min-h-[15rem] sm:min-h-[13rem] lg:min-h-[12.5rem]"} ${className}`}
    >
      <span className="shop-tag">{item.tag}</span>
      <span className={`flex flex-1 items-center justify-center ${big ? "px-10 pt-12 pb-6" : "px-5 pt-10 pb-3"}`}>
        <PixelArt art={item.art} className={`shop-art ${big ? "w-[34%] lg:w-[44%]" : "w-[40%] sm:w-[30%] lg:w-[24%]"}`} />
      </span>
      <span className="shop-banner">
        <span className="font-mono text-[10px] tracking-widest text-white/75 uppercase">{RARITY_LABEL[item.rarity]}</span>
        <span className={`display block leading-none ${big ? "text-5xl sm:text-6xl" : "text-2xl sm:text-4xl"}`}>{item.name}</span>
        <span className="mt-1.5 inline-flex items-center gap-1 font-mono text-lg font-bold">
          <Coin />
          {item.cost}
        </span>
      </span>
    </button>
  );
}

function ItemDialog({ item, credits, apps, onClose }: { item: Item; credits: number; apps: { id: string; name: string }[]; onClose: () => void }) {
  const [appId, setAppId] = useState(apps[0]?.id ?? "");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const buyRef = useRef<HTMLButtonElement>(null);
  const short = credits < item.cost;

  const close = useCallback(() => !pending && onClose(), [pending, onClose]);
  useEffect(() => {
    buyRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  function spend() {
    setMessage(null);
    startTransition(async () => {
      const result = await item.action(appId);
      setConfirming(false);
      setMessage(result.ok ? { ok: true, text: item.done } : { ok: false, text: result.error });
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shop-item-title"
        onClick={(e) => e.stopPropagation()}
        className={`rise shop-tile shop-${item.rarity} relative w-full max-w-md overflow-hidden rounded-t-2xl pb-[env(safe-area-inset-bottom)] text-white shadow-2xl sm:rounded-2xl`}
      >
        <button type="button" onClick={close} aria-label="Close" className="absolute top-3 right-3 z-10 rounded-lg px-3 py-1.5 text-white/80 hover:bg-white/15 hover:text-white">
          ✕
        </button>
        <div className="flex justify-center px-6 pt-8 pb-4">
          <PixelArt art={item.art} className="shop-art w-28" />
        </div>
        <div className="bg-black/55 p-5">
          <p className="font-mono text-[10px] tracking-widest text-white/75 uppercase">
            {RARITY_LABEL[item.rarity]} · {item.tag}
          </p>
          <h3 id="shop-item-title" className="display mt-1 text-5xl leading-none">
            {item.name}
          </h3>
          <p className="mt-2 text-sm text-white/85">{item.about}</p>
          {item.status && <p className="mt-2 text-sm font-semibold">{item.status}</p>}

          <div className="mt-4 flex flex-col gap-2">
            {item.off ? (
              <p className="text-sm text-white/85">{item.off}</p>
            ) : (
              <>
                {item.id === "spotlight" && apps.length > 1 && (
                  <label className="flex flex-col gap-1 text-xs font-medium text-white/80">
                    Which app
                    <select className="field py-2 text-sm" value={appId} onChange={(e) => setAppId(e.target.value)}>
                      {apps.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {confirming ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="shop-buy" disabled={pending} onClick={spend}>
                      {pending ? "Spending…" : `Spend ${item.cost} V Coin`}
                    </button>
                    <button type="button" className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white/85 hover:bg-white/10" disabled={pending} onClick={() => setConfirming(false)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button ref={buyRef} type="button" className="shop-buy self-start" disabled={short} onClick={() => setConfirming(true)}>
                    {item.buy} · <Coin />
                    {item.cost}
                  </button>
                )}
                {short && (
                  <p className="text-xs text-white/85">
                    You have {credits}, so you need {item.cost - credits} more.{" "}
                    <Link href="/test" className="underline">
                      Earn it testing apps
                    </Link>{" "}
                    or{" "}
                    <Link href="/credits#buy" className="underline">
                      get a pack
                    </Link>
                    .
                  </p>
                )}
              </>
            )}
            {message && (
              <p aria-live="polite" className={`rounded-md px-3 py-2 text-sm font-semibold ${message.ok ? "bg-white/15" : "bg-black/40 text-[#ffb4a6]"}`}>
                {message.text}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pixel art for the tiles, drawn like the pixel V logo: one letter per pixel.
// ---------------------------------------------------------------------------

type Art = { rows: string[]; colors: Record<string, string> };

function PixelArt({ art, className = "" }: { art: Art; className?: string }) {
  const w = art.rows[0].length;
  const h = art.rows.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} shapeRendering="crispEdges" aria-hidden>
      {art.rows.flatMap((row, y) =>
        [...row].map((c, x) => (art.colors[c] ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={art.colors[c]} /> : null)),
      )}
    </svg>
  );
}

const CROWN: Art = {
  rows: [
    "Y.....Y.....Y",
    "YY...YYY...YY",
    "YYY..YYY..YYY",
    "YYYY.YYY.YYYY",
    "YYYYYYYYYYYYY",
    "YHYYYYYYYYYHY",
    "YYYRYYMYYBYYY",
    "YYYYYYYYYYYYY",
    "OOOOOOOOOOOOO",
    "OOOOOOOOOOOOO",
  ],
  colors: { Y: "#ffd84a", H: "#fff3b0", O: "#e08a1e", R: "#ff5a5a", M: "#82ed9d", B: "#40c4ff" },
};

const STAR: Art = {
  rows: [
    "......Y......",
    ".....YYY.....",
    ".....YYY.....",
    "....YYHYY....",
    "YYYYYYHYYYYYY",
    ".YYYYYYYYYYY.",
    "..YYYYYYYYY..",
    "...YYYYYYY...",
    "...YYYYYYY...",
    "..YYYY.YYYY..",
    "..YYY...YYY..",
    ".YY.......YY.",
  ],
  colors: { Y: "#ffe066", H: "#fffbe0" },
};

const WINDOW: Art = {
  rows: [
    "WWWWWWWWWWWWW",
    "WBBBBBBBBBBBW",
    "WWWWWWWWWWWWW",
    "W...........W",
    "W.....G.....W",
    "W.....G.....W",
    "W...GGGGG...W",
    "W.....G.....W",
    "W.....G.....W",
    "W...........W",
    "WWWWWWWWWWWWW",
  ],
  colors: { W: "#ffffff", B: "#40c4ff", G: "#82ed9d", ".": "#0b1b2b" },
};

const TARGET: Art = {
  rows: ["..RRRRR..", ".RWWWWWR.", "RWRRRRRWR", "RWRWWWRWR", "RWRWRWRWR", "RWRWWWRWR", "RWRRRRRWR", ".RWWWWWR.", "..RRRRR.."],
  colors: { R: "#ff5a5a", W: "#ffffff" },
};

const GIFT: Art = {
  rows: ["..R...R..", "...R.R...", "YYYYRYYYY", "YYYYRYYYY", ".YYYRYYY.", ".YYYRYYY.", ".YYYRYYY.", ".YYYRYYY."],
  colors: { R: "#ff5a5a", Y: "#ffd84a" },
};

const PERSON: Art = {
  rows: ["...SSS...", "..SSSSS..", "..SSSSS..", "...SSS...", ".BBBBBBB.", "BBBBBBBBB", "BBBBBBBBB", "BBBBBBBBB"],
  colors: { S: "#ffd9b8", B: "#40c4ff" },
};

const HEART: Art = {
  rows: [".RR...RR.", "RRRR.RRRR", "RHRRRRRRR", "RRRRRRRRR", ".RRRRRRR.", "..RRRRR..", "...RRR...", "....R...."],
  colors: { R: "#ff6b8a", H: "#ffd0da" },
};

const COMMUNITY = [
  { href: "/credits#bounties", title: "Bounties", tag: "Earn or post", body: "Pay people to find bugs.", art: TARGET },
  { href: "/credits#perks", title: "Perks", tag: "Deals", body: "Deals on other builders' apps.", art: GIFT },
  { href: "/submit", title: "Testers", tag: "For your app", body: "Guaranteed testers for your app.", art: PERSON },
  { href: "/browse", title: "Tips", tag: "Say thanks", body: "Tip a builder or tester.", art: HEART },
];
