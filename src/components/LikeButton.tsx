"use client";

import { useState, useTransition } from "react";

import { setLike } from "@/app/actions";
import { formatCount } from "@/lib/format";

import { useSignIn } from "./SignIn";

type Props = {
  dropId: string;
  initialLiked: boolean;
  initialCount: number;
  signedIn: boolean;
  layout?: "rail" | "inline";
};

export function LikeButton({ dropId, initialLiked, initialCount, signedIn, layout = "rail" }: Props) {
  const signIn = useSignIn();
  const [liked, setLiked] = useState(initialLiked);
  const [bump, setBump] = useState(0);
  const [count, setCount] = useState(initialCount);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (!signedIn) {
      signIn("like this Drop");
      return;
    }
    const next = !liked;
    setLiked(next);
    if (next) setBump((b) => b + 1);
    setCount((c) => c + (next ? 1 : -1));
    setError(null);
    startTransition(async () => {
      const result = await setLike(dropId, next);
      if (!result.ok) {
        setLiked(!next);
        setCount((c) => c + (next ? -1 : 1));
        setError(result.error);
      }
    });
  }

  const heart = (
    <svg key={bump} viewBox="0 0 24 24" className={`h-7 w-7 ${bump ? "animate-pop" : ""}`} aria-hidden>
      <path
        d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.2 5.2 3 1.6-1.8 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"
        fill={liked ? "var(--color-heart)" : "none"}
        stroke={liked ? "var(--color-heart)" : "currentColor"}
        strokeWidth="1.8"
      />
    </svg>
  );

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
      title={error ?? undefined}
      className={
        layout === "rail"
          ? "flex flex-col items-center gap-1 font-mono text-[11px] font-semibold text-ink drop-shadow"
          : "btn-ghost"
      }
    >
      {heart}
      <span>{formatCount(count)}</span>
    </button>
  );
}
