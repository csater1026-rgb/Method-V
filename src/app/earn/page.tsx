import { redirect } from "next/navigation";

// Earn is now part of the V Store (its earnings are below the item shop).
// Old links, inbox items and Stripe's return links keep working.
export default async function EarnPage({ searchParams }: PageProps<"/earn">) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, v);
  }
  const query = params.toString();
  redirect(`/store${query ? `?${query}` : ""}#earnings`);
}
