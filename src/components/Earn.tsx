"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  backApp,
  buyPro,
  cashOut,
  endSponsorship,
  fundSponsorship,
  offerSponsorship,
  pinApp,
  respondSponsorship,
  setUpPayouts,
} from "@/app/actions";
import { EARN, formatCents } from "@/lib/constants";
import type { ActionResult, Sponsorship } from "@/lib/types";

import { useSignIn } from "./SignIn";

type MyApp = { id: string; name: string };
type Redirect = { ok: true; url: string } | { ok: false; error: string };

// Dollars typed by a person -> whole cents, or NaN.
function toCents(value: string): number {
  const n = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && value.trim() !== "" ? Math.round(n * 100) : NaN;
}

// Runs an action that returns a Stripe URL and goes there.
function useCheckout() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function go(action: () => Promise<Redirect>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) window.location.assign(result.url);
      else setError(result.error);
    });
  }
  return { go, error, pending };
}

// "Back this app": a one-off tip. The builder gets it minus Method V's 5%.
export function BackButton({
  app,
  signedIn,
}: {
  app: { id: string; slug: string; name: string };
  signedIn: boolean;
}) {
  const signIn = useSignIn();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>(String(EARN.tip.presets[1] / 100));
  const [note, setNote] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const { go, error, pending } = useCheckout();
  const cents = toCents(amount);
  const valid = cents >= EARN.tip.min && cents <= EARN.tip.max;

  return (
    <span className="relative">
      <button
        type="button"
        className="btn-ghost px-5 py-3 text-base"
        aria-expanded={open}
        onClick={() => (signedIn ? setOpen((o) => !o) : signIn(`back ${app.name}`))}
      >
        ♥ Back it
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`Back ${app.name}`}
          className="absolute left-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-4 text-left shadow-xl"
        >
          <p className="font-semibold">Back {app.name}</p>
          <p className="mt-0.5 text-xs text-muted">
            A one-off tip to the builder. They get {100 - EARN.tip.feePercent}% of it.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Amount">
            {EARN.tip.presets.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={cents === p}
                onClick={() => setAmount(String(p / 100))}
                className={`rounded-md border px-3 py-1.5 font-mono text-sm font-semibold ${
                  cents === p ? "border-accent bg-accent text-accent-ink" : "border-line hover:border-muted"
                }`}
              >
                {formatCents(p)}
              </button>
            ))}
            <label className="flex items-center gap-1 rounded-md border border-line px-2 font-mono text-sm">
              $
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Other amount in dollars"
                className="w-14 bg-transparent py-1.5 outline-none"
              />
            </label>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={140}
            rows={2}
            placeholder="Say why (optional)"
            aria-label="Note"
            className="field mt-3 resize-none"
          />
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            Show my name on the backers wall
          </label>
          {!valid && <p className="mt-2 text-xs text-danger">Tip between $1 and $500.</p>}
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-accent"
              disabled={pending || !valid}
              onClick={() => go(() => backApp(app.id, app.slug, cents, note, isPublic))}
            >
              {pending ? "Opening checkout…" : valid ? `Back with ${formatCents(cents)}` : "Back it"}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

// Offer to pay another app per real try it sends you.
export function SponsorOffer({ target, myApps }: { target: { id: string; name: string }; myApps: MyApp[] }) {
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState(myApps[0]?.id ?? "");
  const [price, setPrice] = useState("0.50");
  const [budget, setBudget] = useState("50");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const priceCents = toCents(price);
  const budgetCents = toCents(budget);
  const tries = priceCents > 0 ? Math.floor(budgetCents / priceCents) : 0;

  return (
    <section aria-label="Sponsor" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="display text-3xl">Sponsor {target.name}</h2>
          <p className="mt-1 text-sm text-muted">
            Pay per real try: your app shows as <span className="tag">Sponsored</span> on {target.name}, and you only pay
            when someone taps through to you.
          </p>
        </div>
        {!open && (
          <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
            Make an offer
          </button>
        )}
      </div>
      {open && (
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setMessage(null);
            startTransition(async () => {
              const r = await offerSponsorship(fromId, target.id, priceCents, budgetCents, note);
              setMessage(
                r.ok
                  ? { ok: true, text: `Offer sent. You'll pay once ${target.name}'s builder accepts.` }
                  : { ok: false, text: r.error },
              );
              if (r.ok) setOpen(false);
            });
          }}
        >
          {myApps.length > 1 && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted">Sponsor with</span>
              <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="field w-auto py-1.5">
                {myApps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Per try
              <span className="flex items-center gap-1 rounded-lg border border-line px-2 font-mono font-normal">
                $
                <input
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  aria-label="Price per try in dollars"
                  className="w-full bg-transparent py-2 outline-none"
                />
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Budget
              <span className="flex items-center gap-1 rounded-lg border border-line px-2 font-mono font-normal">
                $
                <input
                  inputMode="decimal"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  aria-label="Budget in dollars"
                  className="w-full bg-transparent py-2 outline-none"
                />
              </span>
            </label>
          </div>
          <p className="font-mono text-xs text-muted">
            {tries > 0 ? `Up to ${tries} tries. ` : ""}
            $0.10–$5 a try, $10–$1,000 budget. Unspent budget comes back to you.
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={280}
            rows={2}
            placeholder={`Why ${target.name}'s users would like your app (optional)`}
            aria-label="Message"
            className="field resize-none"
          />
          <div className="flex gap-2">
            <button className="btn-accent" disabled={pending}>
              {pending ? "Sending…" : "Send offer"}
            </button>
            <button type="button" className="text-sm text-muted hover:text-ink" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {message && <p className={`mt-2 text-sm ${message.ok ? "text-accent" : "text-danger"}`}>{message.text}</p>}
    </section>
  );
}

const STATUS_LABEL: Record<string, string> = {
  offered: "Offer",
  accepted: "Waiting for payment",
  active: "Running",
  completed: "Budget used up",
  ended: "Ended",
  declined: "Declined",
};

// One deal on the Earn page, with the buttons that make sense for your side.
export function SponsorshipRow({ deal }: { deal: Sponsorship }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const checkout = useCheckout();
  const isSponsor = deal.mine === "sponsor";
  const other = isSponsor ? deal.host : deal.sponsor;
  const pct = deal.budget_cents ? Math.round((deal.spent_cents / deal.budget_cents) * 100) : 0;
  const hostShare = deal.price_cents - Math.round((deal.price_cents * EARN.sponsor.feePercent) / 100);

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={deal.status === "active" ? "tag-accent" : "tag"}>{STATUS_LABEL[deal.status]}</span>
        <span>
          {isSponsor ? "You sponsor " : "Sponsored by "}
          {other ? (
            <Link href={`/apps/${other.slug}`} className="font-semibold hover:underline">
              {other.name}
            </Link>
          ) : (
            "a deleted app"
          )}
          {isSponsor && deal.sponsor && <span className="text-muted"> with {deal.sponsor.name}</span>}
          {!isSponsor && deal.host && <span className="text-muted"> on {deal.host.name}</span>}
        </span>
        <span className="ml-auto font-mono text-xs text-muted">
          {formatCents(deal.price_cents)}/try · {formatCents(deal.budget_cents)} budget
        </span>
      </div>
      {deal.message && <p className="text-sm text-ink/85">“{deal.message}”</p>}

      {(deal.status === "active" || deal.status === "completed" || (deal.status === "ended" && deal.tries > 0)) && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 font-mono text-xs text-muted">
            {deal.tries} real {deal.tries === 1 ? "try" : "tries"} · {formatCents(deal.spent_cents)} of {formatCents(deal.budget_cents)} spent
            {!isSponsor && <> · you earned {formatCents(deal.tries * hostShare)}</>}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {deal.status === "offered" && !isSponsor && (
          <>
            <button type="button" className="btn-accent" disabled={pending} onClick={() => run(() => respondSponsorship(deal.id, true))}>
              Accept · earn {formatCents(hostShare)}/try
            </button>
            <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => respondSponsorship(deal.id, false))}>
              Decline
            </button>
          </>
        )}
        {deal.status === "accepted" && isSponsor && (
          <button
            type="button"
            className="btn-accent"
            disabled={checkout.pending}
            onClick={() => checkout.go(() => fundSponsorship(deal.id))}
          >
            {checkout.pending ? "Opening checkout…" : `Pay ${formatCents(deal.budget_cents)} to start`}
          </button>
        )}
        {deal.status === "accepted" && !isSponsor && <span className="text-sm text-muted">Starts once they pay the budget.</span>}
        {(deal.status === "offered" || deal.status === "accepted" || deal.status === "active") && (
          <button
            type="button"
            className="text-sm text-muted hover:text-danger"
            disabled={pending}
            onClick={() => run(() => endSponsorship(deal.id))}
          >
            {deal.status === "offered" && isSponsor ? "Withdraw offer" : deal.status === "active" ? "End deal" : "Call it off"}
          </button>
        )}
      </div>
      {(error || checkout.error) && <p className="text-sm text-danger">{error ?? checkout.error}</p>}
    </li>
  );
}

export function PayoutPanel({ balance, account }: { balance: number; account: "none" | "pending" | "ready" }) {
  const router = useRouter();
  const checkout = useCheckout();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-2">
      {account === "ready" ? (
        <button
          type="button"
          className="btn-accent"
          disabled={pending || balance < EARN.payoutMin}
          onClick={() =>
            startTransition(async () => {
              setMessage(null);
              const r = await cashOut();
              setMessage(r.ok ? { ok: true, text: `${formatCents(r.amount ?? 0)} is on its way to your bank.` } : { ok: false, text: r.error });
              router.refresh();
            })
          }
        >
          {pending ? "Sending…" : "Cash out"}
        </button>
      ) : (
        <button type="button" className="btn-accent" disabled={checkout.pending} onClick={() => checkout.go(setUpPayouts)}>
          {checkout.pending ? "Opening Stripe…" : account === "pending" ? "Finish payout setup" : "Set up payouts"}
        </button>
      )}
      <p className="text-xs text-muted">
        {account === "ready"
          ? `Cash out from ${formatCents(EARN.payoutMin)}. Payouts go through Stripe to your bank.`
          : "Payouts go through Stripe. It takes a few minutes and asks for your bank details."}
      </p>
      {(message || checkout.error) && (
        <p className={`text-sm ${message?.ok ? "text-accent" : "text-danger"}`}>{message?.text ?? checkout.error}</p>
      )}
    </div>
  );
}

export function BuyPro({ label }: { label: string }) {
  const checkout = useCheckout();
  return (
    <div className="flex flex-col items-start gap-2">
      <button type="button" className="btn-accent px-6 py-3 text-base" disabled={checkout.pending} onClick={() => checkout.go(buyPro)}>
        {checkout.pending ? "Opening checkout…" : label}
      </button>
      {checkout.error && <p className="text-sm text-danger">{checkout.error}</p>}
    </div>
  );
}

export function PinApp({ apps, pinned }: { apps: MyApp[]; pinned: string | null }) {
  const [value, setValue] = useState(pinned ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Pinned on your profile</span>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          setMessage(null);
          startTransition(async () => {
            const r = await pinApp(next || null);
            setMessage(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
          });
        }}
        className="field w-auto py-1.5"
      >
        <option value="">Nothing pinned</option>
        {apps.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {message && <span className={message.ok ? "text-accent" : "text-danger"}>{message.text}</span>}
    </label>
  );
}
