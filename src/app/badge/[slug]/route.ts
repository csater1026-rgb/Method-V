import { NextResponse, type NextRequest } from "next/server";

import { demoApps } from "@/lib/demo";
import { formatCount } from "@/lib/format";
import { PIXEL_ICON_SIZE, PIXEL_ICON_SVG } from "@/lib/pixel-icon";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// The "Try it on Method V" badge builders embed on their own site or README.
// Plain SVG with system fonts so it renders anywhere without loading ours.

const THEMES = {
  dark: { bg: "#0a1624", ink: "#ffffff", muted: "#9db2c7", accent: "#40f4f5", accentInk: "#04213a", line: "#243a50" },
  light: { bg: "#ffffff", ink: "#0b1b2b", muted: "#56687a", accent: "#0379d9", accentInk: "#ffffff", line: "#b3c3d3" },
};

// The app icon (the pixel V on black), drawn at the left of the badge.
const ICON_BODY = PIXEL_ICON_SVG.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");

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
  <svg x="11" y="11" width="32" height="32" viewBox="0 0 ${PIXEL_ICON_SIZE} ${PIXEL_ICON_SIZE}">${ICON_BODY}</svg>
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
