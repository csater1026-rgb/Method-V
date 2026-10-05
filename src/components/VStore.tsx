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

type Item = {
  id: "pro" | "app_post" | "spotlight";
  name: string;
  // What it's for, shown above the name.
  kind: string;
  tag: string;
  cost: number;
  icon: IconName;
  about: React.ReactNode;
  status: React.ReactNode;
  buy: string;
  done: string;
  off: string | null;
  action: (appId: string) => Promise<ActionResult>;
};

// "until January 4" (demo mode's Pro never ends).
const proUntilText = (iso: string) =>
  new Date(iso).getFullYear() > 2090 ? "forever (demo)" : `until ${new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;

// The V Store as an item shop: bright tiles with dark text, each with a dark
// badge showing a big symbol (PRO, ★, +1…), the name and the price. Mint in
// dark mode, the site's blue in light mode (the --shop-* colors). Tapping a tile opens the item with its Buy
// button (and an app picker for the Spotlight).
export function VStore({ credits, proUntil, store, apps, spotlightCost, spotlightWait }: Props) {
  // proUntil is only passed while Pro is on.
  const pro = proUntil !== null;
  const postsLeft = store ? Math.max(V_STORE.appPost.perWindow - store.appPostsBought, 0) : 0;
  const [open, setOpen] = useState<Item["id"] | null>(null);

  const items: Item[] = [
    {
      id: "pro",
      name: "Method V Pro",
      kind: "For your account",
      tag: pro ? `Pro ${proUntilText(proUntil!)}` : `${V_STORE.pro.days} days`,
      cost: V_STORE.pro.cost,
      icon: "crown",
      about: (
        <>
          Stats for 30 and 90 days, a pinned app on your profile, a Pro badge, and the Spotlight for {SPOTLIGHT.proCost} Methodium instead of{" "}
          {SPOTLIGHT.cost}. Lasts {V_STORE.pro.days} days, no subscription.{" "}
          <Link href="/pro" className="font-semibold underline">
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
      kind: "For your app",
      tag: spotlightWait ? `Next spot in ${spotlightWait}` : "A spot is free now",
      cost: spotlightCost,
      icon: "star",
      about: (
        <>
          Put your app on the stage at the top of Home for {SPOTLIGHT.days} days. {SPOTLIGHT.slots} spots, first come, first served.
          {pro ? "" : ` ${SPOTLIGHT.proCost} Methodium with Pro.`}
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
      kind: "For your app",
      tag: `Up to ${V_STORE.appPost.perWindow} a month`,
      cost: V_STORE.appPost.cost,
      icon: "post",
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
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {COMMUNITY.map((c, i) => (
            // Three tiles: on phones (2 across) the last one takes the full row.
            <li key={c.title} className={i === COMMUNITY.length - 1 ? "col-span-2 sm:col-span-1" : ""}>
              <Link href={c.href} className="shop-tile group relative flex h-full min-h-[13rem] flex-col overflow-hidden rounded-2xl">
                <span className="shop-tag">{c.tag}</span>
                <span className="flex flex-1 items-center justify-center px-6 pt-10 pb-2">
                  <ShopBadge name={c.icon} className="shop-art w-16 sm:w-20" />
                </span>
                <span className="shop-banner">
                  <span className="display block text-2xl leading-none sm:text-3xl">{c.title}</span>
                  <span className="mt-1 block text-xs text-(--shop-ink)/70">{c.body}</span>
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
      aria-label={`${item.name}, ${item.cost} Methodium`}
      className={`shop-tile ${big ? "shop-featured" : ""} group relative flex flex-col overflow-hidden rounded-2xl text-left ${big ? "min-h-[20rem] lg:min-h-[26rem]" : "min-h-[15rem] sm:min-h-[13rem] lg:min-h-[12.5rem]"} ${className}`}
    >
      <span className="shop-tag">{item.tag}</span>
      <span className={`flex flex-1 items-center justify-center ${big ? "px-10 pt-14 pb-4" : "px-5 pt-11 pb-2"}`}>
        <ShopBadge name={item.icon} className={`shop-art ${big ? "w-24 lg:w-36" : "w-16 lg:w-20"}`} />
      </span>
      <span className="shop-banner">
        <span className="font-mono text-[10px] tracking-widest text-(--shop-ink)/60 uppercase">{item.kind}</span>
        <span className={`display mt-0.5 block leading-none ${big ? "text-5xl sm:text-6xl" : "text-2xl sm:text-4xl"}`}>{item.name}</span>
        <span className="shop-price mt-2">
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
        className="rise shop-tile shop-featured relative w-full max-w-md overflow-hidden rounded-t-2xl pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-2xl"
      >
        <button type="button" onClick={close} aria-label="Close" className="absolute top-3 right-3 z-10 rounded-lg px-3 py-1.5 text-(--shop-ink)/70 hover:bg-(--shop-ink)/10 hover:text-(--shop-ink)">
          ✕
        </button>
        <div className="flex justify-center px-6 pt-8 pb-4">
          <ShopBadge name={item.icon} className="shop-art w-24" />
        </div>
        <div className="border-t border-(--shop-ink)/10 bg-white/35 p-5">
          <p className="font-mono text-[10px] tracking-widest text-(--shop-ink)/60 uppercase">
            {item.kind} · {item.tag}
          </p>
          <h3 id="shop-item-title" className="display mt-1 text-5xl leading-none">
            {item.name}
          </h3>
          <p className="mt-2 text-sm text-(--shop-ink)/80">{item.about}</p>
          {item.status && <p className="mt-2 text-sm font-semibold">{item.status}</p>}

          <div className="mt-4 flex flex-col gap-2">
            {item.off ? (
              <p className="text-sm text-(--shop-ink)/80">{item.off}</p>
            ) : (
              <>
                {item.id === "spotlight" && apps.length > 1 && (
                  <label className="flex flex-col gap-1 text-xs font-medium text-(--shop-ink)/80">
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
                      {pending ? "Spending…" : `Spend ${item.cost} Methodium`}
                    </button>
                    <button type="button" className="rounded-lg px-4 py-2.5 text-sm font-semibold text-(--shop-ink)/80 hover:bg-(--shop-ink)/10" disabled={pending} onClick={() => setConfirming(false)}>
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
                  <p className="text-xs text-(--shop-ink)/80">
                    You have {credits}, so you need {item.cost - credits} more.{" "}
                    <Link href="/test" className="underline">
                      Earn it with bounties
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
              <p aria-live="polite" className={`rounded-md px-3 py-2 text-sm font-semibold bg-(--shop-badge) ${message.ok ? "text-(--shop-badge-ink)" : "text-[#ffb4a6]"}`}>
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
// Badges for the tiles: a dark rounded square with a big mint symbol, no
// pictures.
// ---------------------------------------------------------------------------

type IconName = "crown" | "star" | "post" | "target" | "gift" | "heart";

const SYMBOL: Record<IconName, string> = { crown: "PRO", star: "★", post: "+1", target: "◎", gift: "%", heart: "♥" };

function ShopBadge({ name, className = "" }: { name: IconName; className?: string }) {
  const text = SYMBOL[name];
  return (
    <svg viewBox="0 0 64 64" className={`h-auto ${className}`} aria-hidden>
      <rect x="2" y="4" width="60" height="60" rx="17" style={{ fill: "var(--shop-badge-edge)" }} />
      <rect x="2" y="2" width="60" height="60" rx="17" style={{ fill: "var(--shop-badge)" }} />
      <text
        x="32"
        y={text.length > 2 ? 42 : 45}
        textAnchor="middle"
        fontWeight={800}
        fontSize={text.length > 2 ? 26 : 36}
        style={{ fontFamily: "var(--font-display)", fill: "var(--shop-badge-ink)" }}
      >
        {text}
      </text>
    </svg>
  );
}

const COMMUNITY: { href: string; title: string; tag: string; body: string; icon: IconName }[] = [
  { href: "/test", title: "Bounties", tag: "Earn or post", body: "Pay people to try your app or find bugs.", icon: "target" },
  { href: "/credits#perks", title: "Perks", tag: "Deals", body: "Deals on other builders' apps.", icon: "gift" },
  { href: "/browse", title: "Tips", tag: "Say thanks", body: "Tip a builder or tester.", icon: "heart" },
];
