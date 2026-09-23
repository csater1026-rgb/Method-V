"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createBrand, deleteBrand } from "@/app/actions";

export function BrandForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-6 flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const get = (k: string) => String(f.get(k) ?? "");
        setError(null);
        startTransition(async () => {
          const r = await createBrand({ name: get("name"), tagline: get("tagline"), description: get("description"), url: get("url") });
          if (!r.ok) return setError(r.error);
          router.push(`/brands/${r.slug}`);
        });
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Website
        <input name="url" type="url" required placeholder="https://yourcompany.com" className="field font-normal" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Brand name
        <input name="name" required maxLength={60} className="field font-normal" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        One line about it
        <input name="tagline" required maxLength={120} placeholder="Hosting for side projects" className="field font-normal" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        <span>
          More <span className="font-normal text-muted">(optional)</span>
        </span>
        <textarea name="description" rows={4} maxLength={1000} className="field font-normal" placeholder="Who it's for, and what kind of apps you'd like to sponsor." />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button className="btn-accent self-start px-6 py-3 text-base" disabled={pending}>
        {pending ? "Checking your site…" : "List the brand"}
      </button>
    </form>
  );
}

export function DeleteBrand({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        className="text-sm text-muted hover:text-danger"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Delete this brand?")) return;
          startTransition(async () => {
            const r = await deleteBrand(brandId);
            if (r.ok) router.push("/brands");
            else setError(r.error);
          });
        }}
      >
        Delete brand
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
