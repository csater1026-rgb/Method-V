import { apiJson, apiOptions, apiOrigin } from "@/lib/api";

// A map of the public API. Docs for people live at /developers.
export function GET(request: Request) {
  const origin = apiOrigin(request);
  return apiJson({
    name: "Method V public API",
    version: 1,
    docs: `${origin}/developers`,
    endpoints: {
      apps: `${origin}/api/v1/apps?q=&category=&stack=&pricing=&stage=&sort=latest|tried&limit=20`,
      app: `${origin}/api/v1/apps/{slug}`,
      user: `${origin}/api/v1/users/{username}`,
      jobs: `${origin}/api/v1/jobs?kind=hiring|gig|looking&skill=`,
      challenges: `${origin}/api/v1/challenges`,
    },
  });
}

export const OPTIONS = apiOptions;
