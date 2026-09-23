import { ImageResponse } from "next/og";

import { PIXEL_ICON_SQUARE_SVG } from "@/lib/pixel-icon";

// PNG home-screen icons for the web app manifest: /app-icon/192, /app-icon/512
// and /app-icon/maskable (512, with padding so Android can crop it to a circle).
const VARIANTS: Record<string, { size: number; pad: number }> = {
  "192": { size: 192, pad: 0 },
  "512": { size: 512, pad: 0 },
  maskable: { size: 512, pad: 0.14 },
};

export async function GET(_request: Request, ctx: RouteContext<"/app-icon/[variant]">) {
  const { variant } = await ctx.params;
  const v = VARIANTS[variant];
  if (!v) return new Response("Not found", { status: 404 });
  const art = Math.round(v.size * (1 - 2 * v.pad));
  const src = `data:image/svg+xml;base64,${Buffer.from(PIXEL_ICON_SQUARE_SVG).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#121814" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- rendered to PNG, not shown in the page */}
        <img src={src} width={art} height={art} alt="" />
      </div>
    ),
    { width: v.size, height: v.size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
