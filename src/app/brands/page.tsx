import type { Metadata } from "next";
import Link from "next/link";

import { getBrands, getMyBrands, getViewer } from "@/lib/data";
import type { Brand } from "@/lib/types";

export const metadata: Metadata = { title: "Brands" };

// Companies outside Method V that sponsor apps on the Boost Exchange.
export default async function BrandsPage() {
  const viewer = await getViewer();
  const [brands, mine] = await Promise.all([getBrands(), getMyBrands(viewer)]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] tracking-widest text-accent uppercase">Boost Exchange · brands</p>
          <h1 className="display rise mt-1 text-6xl sm:text-7xl">Brand sponsors</h1>
          <p className="mt-1 max-w-xl text-muted">
            Companies that back small apps and pay only for real tries. Every sponsored spot is labeled, and only brands the
            Method V team has verified can sponsor.
          </p>
        </div>
        <Link href="/brands/new" className="btn-accent">
          List your brand
        </Link>
      </div>

      {brands.length > 0 ? (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((b, i) => (
            <BrandCard key={b.id} brand={b} index={i} />
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-muted">No brands yet. Yours could be the first.</p>
      )}

      {mine.length > 0 && (
        <section aria-label="Your brands" className="mt-12">
          <h2 className="display text-4xl">Your brands</h2>
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((b, i) => (
              <BrandCard key={b.id} brand={b} index={i} />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12 rounded-xl border border-line bg-surface p-5">
        <h2 className="display text-3xl">How brand sponsorship works</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink/90">
          <li>List your brand. We check your site loads, then the Method V team verifies it.</li>
          <li>Open any app you&apos;d like to back and tap Make an offer: a price per try and a budget.</li>
          <li>When the builder accepts, you pay the budget and your Sponsored card appears on their app and Drops.</li>
          <li>You pay only for real tries. Unspent budget comes back when the deal ends.</li>
        </ol>
      </section>
    </div>
  );
}

function BrandCard({ brand, index }: { brand: Brand; index: number }) {
  return (
    <li className="rise" style={{ "--i": index } as React.CSSProperties}>
      <Link href={`/brands/${brand.slug}`} className="flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-4 transition hover:border-accent">
        <div className="flex flex-wrap items-center gap-1.5">
          {brand.verified ? <span className="tag-accent">Verified</span> : <span className="tag">Waiting for verification</span>}
        </div>
        <h3 className="display text-4xl leading-none">{brand.name}</h3>
        <p className="text-sm text-muted">{brand.tagline}</p>
      </Link>
    </li>
  );
}
