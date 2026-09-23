import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandForm } from "@/components/Brands";
import { BRAND_LIMITS } from "@/lib/constants";
import { getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "List your brand" };

export default async function NewBrandPage() {
  if (isSupabaseConfigured && !(await getViewer())) redirect("/login?next=/brands/new");
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/brands" className="text-sm text-muted hover:text-ink">
        ← Brands
      </Link>
      <h1 className="display rise mt-2 text-6xl">List your brand</h1>
      <p className="mt-1 text-muted">
        Free. Your brand goes live once we&apos;ve checked your site, and can sponsor apps once the Method V team verifies it. Up
        to {BRAND_LIMITS.perPerson} per person.
      </p>
      <BrandForm />
    </div>
  );
}
