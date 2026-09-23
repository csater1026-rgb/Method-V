import type { NextRequest } from "next/server";

import { apiJson, apiOptions, apiOrigin, publicJob } from "@/lib/api";
import { getJobs } from "@/lib/data";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const jobs = await getJobs({ kind: p.get("kind") ?? undefined, skill: p.get("skill") ?? undefined });
  const origin = apiOrigin(request);
  return apiJson({ jobs: jobs.map((j) => publicJob(j, origin)) });
}

export const OPTIONS = apiOptions;
