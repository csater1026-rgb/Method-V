import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { TAGLINE } from "@/lib/constants";

export const alt = `Method V: ${TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The picture shown when someone shares a methodv.app link (texts, X,
// LinkedIn, Slack, Discord). Every page uses it: signed-out visitors, and
// the link-preview bots, only ever see the welcome page anyway. Made once at
// build time from the same logo file as brand/.
export default async function OpenGraphImage() {
  const logo = await readFile(join(process.cwd(), "brand/method-v-logo-white.png"));
  const src = `data:image/png;base64,${logo.toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          background: "#0a1624",
          color: "#ffffff",
        }}
      >
        <img src={src} width={900} height={200} alt="" />
        <div style={{ fontSize: 42, textAlign: "center", maxWidth: 1140, whiteSpace: "nowrap" }}>{TAGLINE}</div>
        <div style={{ fontSize: 30, color: "#40f4f5", letterSpacing: 2 }}>methodv.app</div>
      </div>
    ),
    size,
  );
}
