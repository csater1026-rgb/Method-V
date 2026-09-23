import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Martian_Mono, Schibsted_Grotesk } from "next/font/google";
import { cookies } from "next/headers";

import { Nav } from "@/components/Nav";
import { isSupabaseConfigured } from "@/lib/supabase/env";

import "./globals.css";

// Poster caps for headlines, a readable grotesk for everything else, and a
// code-editor mono for numbers, timers, credits and tags.
const poster = Big_Shoulders({ variable: "--font-poster", subsets: ["latin"], axes: ["opsz"] });
const body = Schibsted_Grotesk({ variable: "--font-body", subsets: ["latin"] });
const code = Martian_Mono({ variable: "--font-code", subsets: ["latin"], axes: ["wdth"] });

export const metadata: Metadata = {
  title: {
    default: "Method V — 60-second app demos",
    template: "%s · Method V",
  },
  description:
    "Where builders show off what they've made, get real users, earn from their apps and find people to work with. 60 seconds. Then try it.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3eee2" },
    { media: "(prefers-color-scheme: dark)", color: "#121814" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Light or dark if someone picked one with the toggle; otherwise follow the phone.
  const saved = (await cookies()).get("theme")?.value;
  const theme = saved === "light" || saved === "dark" ? saved : undefined;

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${poster.variable} ${body.variable} ${code.variable} h-full antialiased`}
    >
      {/* --chrome is the height of everything above the page, so the Drops feed can fill the rest. */}
      <body
        className="flex min-h-full flex-col font-sans"
        style={{ "--chrome": isSupabaseConfigured ? "calc(3.5rem + 1px)" : "calc(5.25rem + 1px)" } as React.CSSProperties}
      >
        <Nav />
        {!isSupabaseConfigured && (
          <p className="h-7 truncate border-b border-line bg-surface/80 px-4 text-center font-mono text-[10.5px] leading-7 tracking-wide text-muted uppercase">
            Demo mode · sample apps · connect Supabase to post
          </p>
        )}
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
