import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  // /try/ and /go/ record tries on every visit, so keep crawlers out of them.
  return { rules: { userAgent: "*", disallow: ["/try/", "/go/", "/auth/", "/settings", "/submit"] } };
}
