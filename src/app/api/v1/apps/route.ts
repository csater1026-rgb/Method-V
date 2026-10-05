import type { NextRequest } from "next/server";

import { apiJson, apiOptions, apiOrigin, clampLimit, memberOnly, publicApp } from "@/lib/api";
import { getApps } from "@/lib/data";

export async function GET(request: NextRequest) {
  // Members only, like the site (see lib/api.ts).
  const denied = await memberOnly(request);
  if (denied) return denied;
  const p = request.nextUrl.searchParams;
  const get = (k: string) => p.get(k)?.slice(0, 100) || undefined;
  const sort = get("sort");
  const apps = await getApps({
    q: get("q"),
    category: get("category"),
    stack: get("stack"),
    pricing: get("pricing"),
    stage: get("stage"),
    sort: sort === "tried" ? "tried" : undefined,
  });
  const origin = apiOrigin(request);
  return apiJson({ apps: apps.slice(0, clampLimit(p.get("limit"))).map((a) => publicApp(a, origin)) });
}

export const OPTIONS = apiOptions;
