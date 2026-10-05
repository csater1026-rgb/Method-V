import { apiError, apiJson, apiOptions, apiOrigin, memberOnly, publicApp } from "@/lib/api";
import { getApp } from "@/lib/data";

export async function GET(request: Request, ctx: RouteContext<"/api/v1/apps/[slug]">) {
  // Members only, like the site (see lib/api.ts).
  const denied = await memberOnly(request);
  if (denied) return denied;
  const { slug } = await ctx.params;
  const app = /^[a-z0-9-]{1,60}$/.test(slug) ? await getApp(slug) : null;
  if (!app) return apiError("No app with that slug.", 404);
  return apiJson({ app: publicApp(app, apiOrigin(request)) });
}

export const OPTIONS = apiOptions;
