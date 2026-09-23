import { NextResponse, type NextRequest } from "next/server";

import { demoApps } from "@/lib/demo";
import { formatCount } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// The "Try it on Method V" badge builders embed on their own site or README.
// Plain SVG with system fonts so it renders anywhere without loading ours.

const THEMES = {
  dark: { bg: "#121814", ink: "#ffffff", muted: "#a3ab9d", accent: "#a8c09e", accentInk: "#112014", line: "#34413a" },
  light: { bg: "#ffffff", ink: "#1e2a21", muted: "#5c6757", accent: "#4a6a4e", accentInk: "#ffffff", line: "#dde2dd" },
};

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function GET(request: NextRequest, ctx: RouteContext<"/badge/[slug]">) {
  const { slug } = await ctx.params;
  const theme = THEMES[request.nextUrl.searchParams.get("theme") === "light" ? "light" : "dark"];

  let app: { name: string; try_count: number } | null = null;
  if (!isSupabaseConfigured) {
    app = demoApps.find((a) => a.slug === slug) ?? null;
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("apps")
      .select("name, try_count")
      .eq("slug", slug)
      .not("link_checked_at", "is", null)
      .maybeSingle();
    app = data;
  }
  if (!app) return new NextResponse("Not found", { status: 404 });

  const tries = `${formatCount(app.try_count)} ${app.try_count === 1 ? "try" : "tries"}`;
  const font = "'Helvetica Neue', Arial, sans-serif";
  const mono = "ui-monospace, Menlo, Consolas, monospace";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="232" height="54" viewBox="0 0 232 54" role="img" aria-label="Try ${esc(app.name)} on Method V">
  <title>Try ${esc(app.name)} on Method V</title>
  <rect x="0.5" y="0.5" width="231" height="53" rx="10" fill="${theme.bg}" stroke="${theme.line}"/>
  <g transform="translate(12 11) skewX(-10)">
    <rect x="4" width="30" height="32" rx="5" fill="${theme.accent}"/>
    <text x="19" y="25" text-anchor="middle" font-family="${font}" font-size="22" font-weight="900" fill="${theme.accentInk}">V</text>
  </g>
  <text x="56" y="22" font-family="${mono}" font-size="9" letter-spacing="1.2" fill="${theme.muted}">TRY IT ON</text>
  <text x="56" y="40" font-family="${font}" font-size="17" font-weight="800" letter-spacing="0.3" fill="${theme.ink}">METHOD V</text>
  <text x="220" y="31" text-anchor="end" font-family="${mono}" font-size="10" font-weight="700" fill="${theme.accent}">${esc(tries)}</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
