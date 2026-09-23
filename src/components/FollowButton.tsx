"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setFollow } from "@/app/actions";

import { useSignIn } from "./SignIn";

export function FollowButton({
  profileId,
  initialFollowing,
  signedIn,
}: {
  profileId: string;
  initialFollowing: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const signIn = useSignIn();
  const [following, setFollowing] = useState(initialFollowing);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (!signedIn) {
      signIn("follow builders");
      return;
    }
    const next = !following;
    setFollowing(next);
    setError(null);
    startTransition(async () => {
      const result = await setFollow(profileId, next);
      if (!result.ok) {
        setFollowing(!next);
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={following}
        className={following ? "btn-ghost" : "btn-accent"}
      >
        {following ? "Following" : "Follow"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
