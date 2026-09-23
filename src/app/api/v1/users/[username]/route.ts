import { apiError, apiJson, apiOptions, apiOrigin, publicApp, publicProfile } from "@/lib/api";
import { getProfile } from "@/lib/data";

export async function GET(request: Request, ctx: RouteContext<"/api/v1/users/[username]">) {
  const { username } = await ctx.params;
  const found = /^[a-z0-9_]{3,24}$/.test(username.toLowerCase()) ? await getProfile(username.toLowerCase()) : null;
  if (!found) return apiError("No builder with that username.", 404);
  const origin = apiOrigin(request);
  return apiJson({ user: publicProfile(found.profile, origin), apps: found.apps.map((a) => publicApp(a, origin)) });
}

export const OPTIONS = apiOptions;
