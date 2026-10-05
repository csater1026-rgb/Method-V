"use client";

import { useEffect } from "react";

import { FEED_FIRST_COOKIE } from "@/lib/interests";

// Remembers which Drop the For you feed opened on, so the next visit opens on
// a different one (the feed is shuffled every visit too).
export function RememberFirstDrop({ id }: { id: string }) {
  useEffect(() => {
    document.cookie = `${FEED_FIRST_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }, [id]);
  return null;
}
