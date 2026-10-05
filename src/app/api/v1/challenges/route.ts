import { apiJson, apiOptions, apiOrigin, memberOnly, publicChallenge } from "@/lib/api";
import { getChallenges } from "@/lib/data";

export async function GET(request: Request) {
  // Members only, like the site (see lib/api.ts).
  const denied = await memberOnly(request);
  if (denied) return denied;
  const origin = apiOrigin(request);
  return apiJson({ challenges: (await getChallenges()).map((c) => publicChallenge(c, origin)) });
}

export const OPTIONS = apiOptions;
