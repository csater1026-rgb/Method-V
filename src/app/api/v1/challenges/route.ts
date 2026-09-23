import { apiJson, apiOptions, apiOrigin, publicChallenge } from "@/lib/api";
import { getChallenges } from "@/lib/data";

export async function GET(request: Request) {
  const origin = apiOrigin(request);
  return apiJson({ challenges: (await getChallenges()).map((c) => publicChallenge(c, origin)) });
}

export const OPTIONS = apiOptions;
