import { apiError, apiJson, apiOptions, apiOrigin, publicApp } from "@/lib/api";
import { getApp } from "@/lib/data";

export async function GET(request: Request, ctx: RouteContext<"/api/v1/apps/[slug]">) {
  const { slug } = await ctx.params;
  const app = /^[a-z0-9-]{1,60}$/.test(slug) ? await getApp(slug) : null;
  if (!app) return apiError("No app with that slug.", 404);
  return apiJson({ app: publicApp(app, apiOrigin(request)) });
}

export const OPTIONS = apiOptions;
