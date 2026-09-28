import { NextResponse, type NextRequest } from "next/server";

import { COVER_HEIGHT, COVER_WIDTH } from "@/lib/cover-size";
import { getApp } from "@/lib/data";
import { publicFileUrl } from "@/lib/supabase/env";

// What a link-preview bot sees for methodv.app/apps/<slug> (the proxy sends
// it here; see previewFor in lib/gate.ts): the app's name, tagline and cover
// picture as a preview card. Only what's already public (embeds and the API
// show the same). Never cached, because it answers at the app's own address.

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function GET(request: NextRequest, ctx: RouteContext<"/preview/apps/[slug]">) {
  const { slug } = await ctx.params;
  const app = /^[a-z0-9-]{1,60}$/.test(slug) ? await getApp(slug) : null;
  if (!app) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || request.nextUrl.origin;
  const page = `${origin}/apps/${app.slug}`;
  // The builder's cover picture, else the frame from the latest Drop, else Method V's own card.
  const cover = publicFileUrl(app.cover_path ?? null);
  const image = cover ?? app.drop?.poster_url ?? `${origin}/opengraph-image`;
  const title = `${app.name} on Method V`;
  const size = cover
    ? `\n<meta property="og:image:width" content="${COVER_WIDTH}">\n<meta property="og:image:height" content="${COVER_HEIGHT}">`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(app.tagline)}">
<link rel="canonical" href="${esc(page)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Method V">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(app.tagline)}">
<meta property="og:url" content="${esc(page)}">
<meta property="og:image" content="${esc(image)}">${size}
<meta property="og:image:alt" content="${esc(app.name)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(app.tagline)}">
<meta name="twitter:image" content="${esc(image)}">
</head><body>
<h1>${esc(app.name)}</h1>
<p>${esc(app.tagline)}</p>
<p><a href="${esc(page)}">See it on Method V</a></p>
</body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; img-src https: data:; base-uri 'none'; form-action 'none'",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
