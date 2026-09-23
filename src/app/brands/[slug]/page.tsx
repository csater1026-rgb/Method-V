import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppCard } from "@/components/AppCard";
import { DeleteBrand } from "@/components/Brands";
import { getBrand, getViewer } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/brands/[slug]">): Promise<Metadata> {
  const found = await getBrand((await params).slug);
  return found ? { title: found.brand.name, description: found.brand.tagline } : { title: "Brand not found" };
}

export default async function BrandPage({ params }: PageProps<"/brands/[slug]">) {
  const { slug } = await params;
  const [found, viewer] = await Promise.all([getBrand(slug), getViewer()]);
  if (!found) notFound();
  const { brand, sponsoring } = found;
  const isOwner = viewer?.id === brand.owner_id;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <Link href="/brands" className="text-sm text-muted hover:text-ink">
        ← Brands
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {brand.verified ? <span className="tag-accent">Verified sponsor</span> : <span className="tag">Waiting for verification</span>}
      </div>
      <h1 className="display rise mt-3 text-7xl break-words">{brand.name}</h1>
      <p className="mt-1 text-lg text-muted">{brand.tagline}</p>
      {brand.description && <p className="mt-4 max-w-2xl leading-relaxed whitespace-pre-line text-ink/90">{brand.description}</p>}
      {brand.live && (
        <a href={`/go/${brand.slug}`} target="_blank" rel="noopener" className="btn-ghost mt-5">
          Visit {brand.name} →
        </a>
      )}

      {isOwner && (
        <div className="mt-6 rounded-xl border border-line bg-surface p-4 text-sm">
          {brand.verified ? (
            <p>
              You&apos;re verified. Open any app and tap <strong>Make an offer</strong>, then pick {brand.name}. Deals show up
              on{" "}
              <Link href="/earn" className="text-accent hover:underline">
                Earn
              </Link>
              .
            </p>
          ) : (
            <p className="text-muted">
              The Method V team verifies brands by hand before they can sponsor. You&apos;ll be able to make offers once
              that&apos;s done.
            </p>
          )}
          <div className="mt-3">
            <DeleteBrand brandId={brand.id} />
          </div>
        </div>
      )}

      <section aria-label="Sponsoring" className="mt-10">
        <h2 className="display text-4xl">Sponsoring now</h2>
        {sponsoring.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No running sponsorships.</p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sponsoring.map((app, i) => (
              <AppCard key={app.id} app={app} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
