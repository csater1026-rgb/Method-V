"use client";

import { useState, useTransition } from "react";

import {
  approvePackage,
  cancelPackage,
  deliverPackage,
  payPackage,
  reportPackage,
  respondPackage,
  setSponsorPackage,
  sponsorPackage,
} from "@/app/actions";
import { PACKAGE_RULES, SPONSOR_PACKAGES, formatCents, packageFor } from "@/lib/constants";
import type { ActionResult, PackageDeal, SponsorPackage } from "@/lib/types";

// "$25" -> 2500 cents, or NaN.
function toCents(value: string): number {
  const n = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && value.trim() !== "" ? Math.round(n * 100) : NaN;
}

// ---------------------------------------------------------------------------
// The builder's packages, on their own app page
// ---------------------------------------------------------------------------

export function PackageEditor({ app, packages }: { app: { id: string; slug: string; name: string }; packages: SponsorPackage[] }) {
  return (
    <section aria-label="Sponsorship packages" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <p className="eyebrow">Get paid to promote</p>
      <h2 className="display mt-1 text-4xl">Sponsorship packages</h2>
      <p className="mt-1 text-sm text-muted">
        Turn on what you&apos;re happy to do and set your price. Sponsors pay up front and Method V holds it; you have{" "}
        {PACKAGE_RULES.answerDays} days to accept or decline, and you&apos;re paid once it&apos;s done (less{" "}
        {PACKAGE_RULES.feePercent}%, or {PACKAGE_RULES.proFeePercent}% with Pro).
      </p>
      <ul className="mt-4 flex flex-col divide-y divide-line rounded-lg border border-line">
        {SPONSOR_PACKAGES.map((p) => (
          <PackageRow key={p.kind} app={app} kind={p.kind} current={packages.find((x) => x.kind === p.kind) ?? null} />
        ))}
      </ul>
    </section>
  );
}

function PackageRow({ app, kind, current }: { app: { id: string; slug: string }; kind: string; current: SponsorPackage | null }) {
  const pkg = packageFor(kind)!;
  const [on, setOn] = useState(current?.active ?? false);
  const [price, setPrice] = useState(String((current?.price_cents ?? pkg.suggested) / 100));
  const [note, setNote] = useState(current?.note ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save(active: boolean) {
    setMessage(null);
    startTransition(async () => {
      const r = await setSponsorPackage(app.id, app.slug, kind, toCents(price), note, active);
      setMessage(r.ok ? { ok: true, text: active ? "On. Sponsors can pick it now." : "Off." } : { ok: false, text: r.error });
      if (r.ok) setOn(active);
    });
  }

  return (
    <li className="flex flex-col gap-3 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{pkg.label}</p>
          <p className="text-sm text-muted">{pkg.does}</p>
        </div>
        <span className={on ? "tag-accent" : "tag"}>{on ? "On" : "Off"}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 rounded-lg border border-line bg-bg px-2 font-mono text-sm">
          $
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-label={`${pkg.label} price in dollars`}
            className="w-20 bg-transparent py-1.5 outline-none"
          />
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={140}
          placeholder={kind === "video" ? "e.g. TikTok · 12k followers" : "Optional note for sponsors"}
          aria-label={`${pkg.label} note`}
          className="field min-w-40 flex-1 py-1.5 text-sm"
        />
        <button type="button" className={on ? "btn-ghost" : "btn-accent"} disabled={pending} onClick={() => save(true)}>
          {on ? "Save" : "Turn on"}
        </button>
        {on && (
          <button type="button" className="text-sm text-muted hover:text-danger" disabled={pending} onClick={() => save(false)}>
            Turn off
          </button>
        )}
      </div>
      {message && <p className={`text-sm ${message.ok ? "text-accent" : "text-danger"}`}>{message.text}</p>}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Sponsoring someone else's app
// ---------------------------------------------------------------------------

type Sponsor = { id: string; name: string; kind?: "app" | "brand" };

export function SponsorPackages({
  app,
  packages,
  sponsors,
}: {
  app: { id: string; name: string };
  packages: SponsorPackage[];
  sponsors: Sponsor[];
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [fromId, setFromId] = useState(sponsors[0]?.id ?? "");
  const [brief, setBrief] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (packages.length === 0) return null;
  const choice = packages.find((p) => p.kind === picked);

  return (
    <section aria-label="Sponsor" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="display text-3xl">Sponsor {app.name}</h2>
      <p className="mt-1 text-sm text-muted">
        Pick a package. You pay now and Method V holds it: if the builder doesn&apos;t accept within {PACKAGE_RULES.answerDays}{" "}
        days, or doesn&apos;t deliver, you get it all back.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {packages.map((p) => {
          const info = packageFor(p.kind);
          if (!info) return null;
          const selected = picked === p.kind;
          return (
            <li key={p.kind}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setPicked(selected ? null : p.kind);
                  setError(null);
                }}
                className={`flex h-full w-full flex-col items-start gap-1 rounded-lg border p-3 text-left transition ${
                  selected ? "border-accent bg-accent/5" : "border-line bg-bg/40 hover:border-accent"
                }`}
              >
                <span className="flex w-full items-baseline justify-between gap-2">
                  <span className="font-semibold">{info.label}</span>
                  <span className="font-mono font-bold text-accent">{formatCents(p.price_cents)}</span>
                </span>
                <span className="text-sm text-muted">{info.does}</span>
                {p.note && <span className="tag mt-1">{p.note}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {choice && (
        <form
          className="mt-4 flex flex-col gap-3 border-t border-line pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (sponsors.length === 0) return setError("To sponsor, you need a live app or a verified brand on Method V.");
            const from = sponsors.find((s) => s.id === fromId) ?? sponsors[0];
            startTransition(async () => {
              const r = await sponsorPackage(app.id, app.name, choice.kind, from.id, from.kind ?? "app", brief);
              if (r.ok) window.location.assign(r.url);
              else setError(r.error);
            });
          }}
        >
          {sponsors.length > 1 && (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Promote</span>
              <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="field w-auto py-1.5">
                {sponsors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.kind === "brand" ? `${s.name} (brand)` : s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Brief for the builder
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="What should they say or show? A link, a code, the one thing to mention…"
              className="field font-normal"
            />
          </label>
          <button className="btn-accent self-start" disabled={pending}>
            {pending ? "Opening checkout…" : `Pay ${formatCents(choice.price_cents)}`}
          </button>
          {sponsors.length === 0 && (
            <p className="text-xs text-muted">You need a live app or a verified brand on Method V to sponsor.</p>
          )}
        </form>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// A deal, on /earn
// ---------------------------------------------------------------------------

const STATUS: Record<string, string> = {
  unpaid: "Not paid yet",
  requested: "Waiting for the builder",
  accepted: "Being done",
  delivered: "Delivered",
  completed: "Done · paid",
  declined: "Declined · refunded",
  expired: "Expired · refunded",
  cancelled: "Cancelled",
  disputed: "Problem reported · Method V is looking",
  refunded: "Refunded",
};

export function PackageDealCard({ deal }: { deal: PackageDeal }) {
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState("");
  const [problem, setProblem] = useState("");
  const [reporting, setReporting] = useState(false);
  const [pending, startTransition] = useTransition();
  const info = packageFor(deal.kind);
  const host = deal.mine === "host";

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) setError(r.error);
    });
  }

  const title = host
    ? `${deal.sponsor?.name ?? "A sponsor"} → ${info?.label ?? deal.kind}`
    : `${info?.label ?? deal.kind} on ${deal.host?.name ?? "an app"}`;

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="text-xs text-muted">
            {host ? "From" : "With"} {deal.other ? `@${deal.other}` : "someone"} · {STATUS[deal.status] ?? deal.status}
          </p>
        </div>
        <span className="font-mono font-bold">{formatCents(deal.price_cents)}</span>
      </div>
      {deal.brief && <p className="rounded-lg bg-bg/60 p-2 text-sm whitespace-pre-line">{deal.brief}</p>}
      {deal.proof_url && (
        <a href={deal.proof_url} target="_blank" rel="noopener noreferrer nofollow" className="text-sm break-all text-accent hover:underline">
          {deal.proof_url}
        </a>
      )}
      {deal.kind === "card" && deal.card_until && deal.status === "delivered" && (
        <p className="text-sm text-muted">The Sponsored card is up until {new Date(deal.card_until).toLocaleDateString()}.</p>
      )}
      {deal.status === "disputed" && deal.problem && <p className="text-sm text-danger">Reported: {deal.problem}</p>}

      {/* The builder */}
      {host && deal.status === "requested" && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-accent" disabled={pending} onClick={() => run(() => respondPackage(deal.id, true))}>
            Accept
          </button>
          <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => respondPackage(deal.id, false))}>
            Decline
          </button>
          <span className="text-xs text-muted">Answer within {PACKAGE_RULES.answerDays} days or they&apos;re refunded.</span>
        </div>
      )}
      {host && deal.status === "accepted" && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => deliverPackage(deal.id, proof));
          }}
        >
          <input
            value={proof}
            onChange={(e) => setProof(e.target.value)}
            placeholder={info?.proof ? `${info.proof} (https://…)` : "https://…"}
            aria-label="Link to where it's live"
            className="field min-w-48 flex-1 py-1.5 text-sm"
          />
          <button className="btn-accent" disabled={pending}>
            Mark delivered
          </button>
        </form>
      )}
      {host && deal.status === "delivered" && deal.kind !== "card" && (
        <p className="text-xs text-muted">You&apos;re paid when they approve, or by itself after {PACKAGE_RULES.approveDays} days.</p>
      )}

      {/* The sponsor */}
      {!host && deal.status === "unpaid" && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-accent"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await payPackage(deal.id);
                if (r.ok) window.location.assign(r.url);
                else setError(r.error);
              })
            }
          >
            Finish paying
          </button>
          <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => cancelPackage(deal.id))}>
            Cancel
          </button>
        </div>
      )}
      {!host && deal.status === "requested" && (
        <button type="button" className="self-start text-sm text-muted hover:text-danger" disabled={pending} onClick={() => run(() => cancelPackage(deal.id))}>
          Cancel and get a full refund
        </button>
      )}
      {!host && deal.status === "delivered" && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-accent" disabled={pending} onClick={() => run(() => approvePackage(deal.id))}>
            Approve · pay the builder
          </button>
          <span className="text-xs text-muted">
            {deal.kind === "card"
              ? `Approved by itself when the card's ${PACKAGE_RULES.cardDays} days end.`
              : `Approved by itself after ${PACKAGE_RULES.approveDays} days.`}
          </span>
        </div>
      )}
      {!host && (deal.status === "accepted" || deal.status === "delivered") && (
        <>
          {reporting ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => reportPackage(deal.id, problem));
              }}
            >
              <textarea
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="What went wrong?"
                aria-label="What went wrong"
                className="field text-sm"
              />
              <button className="btn-ghost self-start" disabled={pending}>
                Send report
              </button>
            </form>
          ) : (
            <button type="button" className="self-start text-sm text-muted hover:text-danger" onClick={() => setReporting(true)}>
              Report a problem
            </button>
          )}
        </>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </li>
  );
}
