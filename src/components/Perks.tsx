"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { claimPerk, savePerk, type PerkInput } from "@/app/actions";
import { PERKS } from "@/lib/constants";
import type { Perk, PerkListing } from "@/lib/types";

import { Coin } from "./Coin";

// Perks on an app's page: deals people unlock with V Coin (the V Coin goes to
// the builder). The builder sees every perk with its code and can add or
// change them; everyone else sees the ones on offer.
export function PerksSection({
  app,
  perks,
  isOwner,
  preview = false,
}: {
  app: { id: string; slug: string; name: string };
  perks: Perk[];
  isOwner: boolean;
  preview?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  if (!isOwner && !preview && perks.length === 0) return null;
  const active = perks.filter((p) => p.active).length;

  return (
    <section id="perks" aria-labelledby="perks-title" className="scroll-mt-20 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="perks-title" className="display text-4xl">
          Perks
        </h2>
        <span className="text-xs text-muted">Unlock with V Coin</span>
      </div>
      <p className="mt-1 text-sm text-muted">
        {isOwner
          ? `Offer a deal on ${app.name} (a promo code, a free month, a lifetime deal) that people unlock with V Coin. The V Coin comes to you, to spend on testers or the Spotlight.`
          : `Deals on ${app.name} from its builder. Unlock one with V Coin you earned testing apps.`}
      </p>

      {perks.length > 0 && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {perks.map((perk) => (
            <li key={perk.id}>
              <PerkCard perk={perk} app={app} isOwner={isOwner} />
            </li>
          ))}
        </ul>
      )}

      {(isOwner || preview) &&
        (adding ? (
          <PerkForm app={app} onDone={() => setAdding(false)} />
        ) : (
          active < PERKS.perApp && (
            <button type="button" onClick={() => setAdding(true)} className="btn-ghost mt-4">
              + Add a perk
            </button>
          )
        ))}
    </section>
  );
}

export function PerkCard({ perk, app, isOwner, showApp = false }: { perk: Perk; app: { slug: string; name: string }; isOwner?: boolean; showApp?: boolean }) {
  const [secret, setSecret] = useState(perk.secret);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const left = perk.quantity === null ? null : Math.max(perk.quantity - perk.claimed_count, 0);

  function unlock() {
    setError(null);
    startTransition(async () => {
      const result = await claimPerk(perk.id, app.slug);
      if (result.ok) {
        setSecret(result.secret ?? "");
        setConfirming(false);
      } else setError(result.error);
    });
  }

  if (editing) return <PerkForm app={{ ...app, id: perk.app_id }} perk={{ ...perk, secret: secret ?? "" }} onDone={() => setEditing(false)} />;

  return (
    <article className={`flex h-full flex-col gap-2 rounded-lg border bg-bg/50 p-4 ${perk.active ? "border-line" : "border-dashed border-line opacity-70"}`}>
      {showApp && (
        <Link href={`/apps/${app.slug}#perks`} className="font-mono text-[11px] tracking-wide text-muted uppercase hover:text-ink">
          {app.name}
        </Link>
      )}
      <h3 className="text-lg leading-tight font-semibold">{perk.title}</h3>
      {perk.details && <p className="text-sm text-muted">{perk.details}</p>}
      <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 font-mono text-xs text-muted">
        <span className="inline-flex items-center gap-1 text-sm font-bold text-ink">
          <Coin /> {perk.cost}
        </span>
        <span>{left === null ? `${perk.claimed_count} unlocked` : `${left} of ${perk.quantity} left`}</span>
        {!perk.active && <span>Off</span>}
      </p>

      {secret ? (
        <SecretBox secret={secret} label={isOwner ? "What people get" : "Your perk"} />
      ) : isOwner ? null : left === 0 ? (
        <p className="text-sm text-muted">All claimed.</p>
      ) : confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={unlock} disabled={pending} className="btn-accent">
            {pending ? "Unlocking…" : `Spend ${perk.cost} V Coin`}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="btn-ghost">
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="btn-accent self-start">
          Unlock · <Coin /> {perk.cost}
        </button>
      )}
      {isOwner && (
        <button type="button" onClick={() => setEditing(true)} className="self-start text-xs text-accent hover:underline">
          Edit
        </button>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </article>
  );
}

function SecretBox({ secret, label }: { secret: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const isLink = /^https?:\/\//i.test(secret);
  return (
    <div className="rounded-md border border-accent/60 bg-accent/10 p-2.5">
      <p className="text-xs font-semibold text-muted uppercase">{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {isLink ? (
          <a href={secret} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all font-mono text-sm text-accent hover:underline">
            {secret}
          </a>
        ) : (
          <code className="min-w-0 break-all font-mono text-sm font-bold">{secret}</code>
        )}
        <button
          type="button"
          className="btn-ghost ml-auto px-2.5 py-1 text-xs"
          onClick={() => {
            void navigator.clipboard?.writeText(secret).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function PerkForm({ app, perk, onDone }: { app: { id: string; slug: string; name: string }; perk?: Perk & { secret: string }; onDone: () => void }) {
  const [form, setForm] = useState<PerkInput>({
    id: perk?.id ?? null,
    title: perk?.title ?? "",
    details: perk?.details ?? "",
    secret: perk?.secret ?? "",
    cost: perk?.cost ?? 25,
    quantity: perk?.quantity ?? null,
    active: perk?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof PerkInput>(key: K, value: PerkInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await savePerk(app.id, app.slug, form);
      if (result.ok) onDone();
      else setError(result.error);
    });
  }

  return (
    <form
      aria-label={perk ? "Edit perk" : "Add a perk"}
      className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-bg/50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        What they get
        <input className="field" value={form.title} maxLength={80} onChange={(e) => set("title", e.target.value)} placeholder="3 months of Pro free" required />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Details <span className="font-normal text-muted">· Optional</span>
        <input className="field" value={form.details} maxLength={500} onChange={(e) => set("details", e.target.value)} placeholder="How to use it, any limits" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Code or link
        <input className="field font-mono" value={form.secret} maxLength={500} onChange={(e) => set("secret", e.target.value)} placeholder="METHODV50 or https://…" required />
        <span className="text-xs font-normal text-muted">Only shown to people who unlock it.</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Price in V Coin
          <input
            className="field"
            type="number"
            min={PERKS.minCost}
            max={PERKS.maxCost}
            value={form.cost}
            onChange={(e) => set("cost", Number(e.target.value))}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          How many <span className="font-normal text-muted">· Empty for no limit</span>
          <input
            className="field"
            type="number"
            min={1}
            max={1000}
            value={form.quantity ?? ""}
            onChange={(e) => set("quantity", e.target.value === "" ? null : Number(e.target.value))}
          />
        </label>
      </div>
      {perk && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> On offer
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn-accent" disabled={pending}>
          {pending ? "Saving…" : perk ? "Save" : "Add perk"}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost">
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

// Perks across Method V, on the V Coin page.
export function PerkList({ perks }: { perks: PerkListing[] }) {
  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
      {perks.map((perk) => (
        <li key={perk.id}>
          <PerkCard perk={perk} app={perk.app} showApp />
        </li>
      ))}
    </ul>
  );
}
