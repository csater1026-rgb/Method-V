import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The jobs board is gone: people show their status on their profile and
  // message each other instead.
  async redirects() {
    return [
      { source: "/jobs", destination: "/browse", permanent: false },
      { source: "/jobs/:path*", destination: "/browse", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        // Everything except the embeddable card refuses to be framed by other
        // sites (clickjacking protection).
        source: "/((?!embed/).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
