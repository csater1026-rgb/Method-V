import { NextResponse, type NextRequest } from "next/server";

import { labelFor, CATEGORIES } from "@/lib/constants";
import { getApp } from "@/lib/data";
import { formatCount } from "@/lib/format";

// An app card other sites can drop in with an <iframe>. Plain HTML and inline
// CSS with system fonts: no scripts, nothing loaded from elsewhere except the
// Drop's poster. "Try it" goes through /try with ?via=embed so it's counted.

const THEMES = {
  dark: { bg: "#121814", surface: "#19211b", ink: "#efe8d8", muted: "#a3ab9d", accent: "#a8c09e", accentInk: "#112014", line: "#34413a" },
  light: { bg: "#fbf8f1", surface: "#f3eee2", ink: "#1e2a21", muted: "#5c6757", accent: "#4a6a4e", accentInk: "#f7f2e7", line: "#d6cdb9" },
};

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function GET(request: NextRequest, ctx: RouteContext<"/embed/[slug]">) {
  const { slug } = await ctx.params;
  const app = /^[a-z0-9-]{1,60}$/.test(slug) ? await getApp(slug) : null;
  if (!app) return new NextResponse("Not found", { status: 404 });

  const t = THEMES[request.nextUrl.searchParams.get("theme") === "light" ? "light" : "dark"];
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? request.nextUrl.origin;
  const page = `${origin}/apps/${app.slug}`;
  const poster = app.drop?.poster_url;
  const tries = `${formatCount(app.try_count)} ${app.try_count === 1 ? "try" : "tries"}`;
  const builder = app.owner.display_name || `@${app.owner.username}`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(app.name)} on Method V</title>
<style>
*{box-sizing:border-box;margin:0}
html,body{height:100%}
body{background:${t.bg};color:${t.ink};font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
.card{display:flex;height:100%;min-height:150px;border:1px solid ${t.line};border-radius:12px;overflow:hidden;background:${t.surface}}
.media{flex:0 0 34%;max-width:170px;background:#121814 ${poster ? `url("${esc(poster)}") center/cover` : `repeating-linear-gradient(135deg,#19211b 0 10px,#222c25 10px 20px)`};display:flex;align-items:flex-end;padding:10px}
.media span{font:700 20px/1 Impact,"Arial Narrow",sans-serif;text-transform:uppercase;color:#efe8d8;${poster ? "display:none" : ""}}
.body{flex:1;min-width:0;padding:14px 16px;display:flex;flex-direction:column;gap:6px}
.kicker{font:600 10px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:${t.muted}}
h1{font:700 26px/1 Impact,"Arial Narrow Bold","Arial Narrow",sans-serif;text-transform:uppercase;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
h1 a{color:inherit;text-decoration:none}
p{color:${t.muted};display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.row{margin-top:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.try{background:${t.accent};color:${t.accentInk};font-weight:700;text-decoration:none;padding:8px 14px;border-radius:8px}
.meta{font:12px ui-monospace,Menlo,monospace;color:${t.muted}}
.meta a{color:${t.muted}}
</style></head>
<body><div class="card">
<div class="media" aria-hidden="true"><span>${esc(app.name)}</span></div>
<div class="body">
<div class="kicker">${esc(labelFor(CATEGORIES, app.category))} · on Method V</div>
<h1><a href="${esc(page)}" target="_blank" rel="noopener">${esc(app.name)}</a></h1>
<p>${esc(app.tagline)}</p>
<div class="row">
<a class="try" href="${esc(`${origin}/try/${app.slug}?via=embed`)}" target="_blank" rel="noopener">Try it →</a>
<span class="meta">${esc(tries)} · by <a href="${esc(`${origin}/u/${app.owner.username}`)}" target="_blank" rel="noopener">${esc(builder)}</a></span>
</div>
</div></div></body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Framable anywhere, but runs nothing and loads only images.
      "Content-Security-Policy": "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; frame-ancestors *; base-uri 'none'; form-action 'none'",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
