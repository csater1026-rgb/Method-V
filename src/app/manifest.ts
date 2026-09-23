import type { MetadataRoute } from "next";

import { TAGLINE } from "@/lib/constants";

// Makes Method V installable to the home screen on iPhone and Android, where
// it opens full screen like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Method V",
    short_name: "Method V",
    description: TAGLINE,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#121814",
    theme_color: "#121814",
    categories: ["productivity", "social", "developer"],
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/app-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Drops", url: "/drops" },
      { name: "Post a Drop", url: "/submit" },
      { name: "Test & earn", url: "/test" },
    ],
  };
}
