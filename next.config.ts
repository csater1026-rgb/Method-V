import type { NextConfig } from "next";

// Where the browser may load things from. Files (videos, photos) and the
// database live on Supabase; everything else is this site. Next.js needs
// inline scripts and styles. Payments and sign-in with Google or Apple are
// page navigations, which this doesn't restrict.
const supabase = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();
const supabaseSocket = supabase.replace(/^https:/, "wss:");
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase}`,
  `media-src 'self' blob: ${supabase}`,
  `connect-src 'self' ${supabase} ${supabaseSocket}`,
  "font-src 'self' data:",
  "frame-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
]
  .join("; ")
  .replace(/ +;/g, ";");

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
        // Everything except the embeddable card (which sets its own strict
        // policy) refuses to be framed by other sites (clickjacking), and gets
        // the security headers.
        source: "/((?!embed/).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: csp },
          // Browsers only ever use https for methodv.app (two years).
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Posting records video, so camera and microphone stay available to
          // this site only; nothing else is needed.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), browsing-topics=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
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
