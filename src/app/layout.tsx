import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Nav } from "@/components/Nav";
import { isSupabaseConfigured } from "@/lib/supabase/env";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Method V — 60-second app demos",
    template: "%s · Method V",
  },
  description:
    "Where builders show off what they've made, get real users, earn from their apps and find people to work with. 60 seconds. Then try it.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      {/* --chrome is the height of everything above the page, so the Drops feed can fill the rest. */}
      <body
        className="flex min-h-full flex-col font-sans"
        style={{ "--chrome": isSupabaseConfigured ? "calc(3.5rem + 1px)" : "calc(5.25rem + 1px)" } as React.CSSProperties}
      >
        <Nav />
        {!isSupabaseConfigured && (
          <p className="h-7 truncate border-b border-line bg-surface px-4 text-center text-xs leading-7 text-muted">
            Demo mode · sample apps only. Connect Supabase to post.
          </p>
        )}
        <main className="flex flex-1 flex-col">{children}</main>
      </body>
    </html>
  );
}
