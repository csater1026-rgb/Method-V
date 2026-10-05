import { apiJson, apiOptions, apiOrigin } from "@/lib/api";

// A map of the API (just the addresses, so it's open). The data itself is for
// members only. Docs for people live at /developers.
export function GET(request: Request) {
  const origin = apiOrigin(request);
  return apiJson({
    name: "Method V API",
    access: "Members only: sign in at methodv.app, or send your sign-in token as \"Authorization: Bearer <token>\".",
    version: 1,
    docs: `${origin}/developers`,
    endpoints: {
      apps: `${origin}/api/v1/apps?q=&category=&stack=&pricing=&stage=&sort=latest|tried&limit=20`,
      app: `${origin}/api/v1/apps/{slug}`,
      user: `${origin}/api/v1/users/{username}`,
      challenges: `${origin}/api/v1/challenges`,
    },
  });
}

export const OPTIONS = apiOptions;
