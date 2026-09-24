import { ImageResponse } from "next/og";

import { PIXEL_ICON_SQUARE_SVG } from "@/lib/pixel-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The iPhone home-screen icon (iOS rounds the corners itself).
export default function AppleIcon() {
  const src = `data:image/svg+xml;base64,${Buffer.from(PIXEL_ICON_SQUARE_SVG).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#000000" }}>
        <img src={src} width={180} height={180} alt="" />
      </div>
    ),
    size,
  );
}
