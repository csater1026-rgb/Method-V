import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  // /try/ records a try on every visit, so keep crawlers out of it.
  return { rules: { userAgent: "*", disallow: ["/try/", "/auth/", "/settings", "/submit"] } };
}
