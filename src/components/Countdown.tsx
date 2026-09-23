"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60) };
}

// "2d 4h 12m" until a time, ticking once a minute.
export function Countdown({ to, className = "" }: { to: string; className?: string }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  // Rendered on the server without a clock, so show the date until the browser takes over.
  if (now === null) {
    return (
      <time dateTime={to} className={className} suppressHydrationWarning>
        {new Date(to).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
      </time>
    );
  }
  const { d, h, m } = parts(target - now);
  return (
    <time dateTime={to} className={className}>
      {d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`}
    </time>
  );
}
