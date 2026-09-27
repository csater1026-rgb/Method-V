"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { agreeToTerms } from "@/app/actions";

export function AgreeForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(agreeToTerms, {});
  const [agreed, setAgreed] = useState(false);
  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="agree"
          required
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
        />
        <span>
          I&apos;m at least 13 and I agree to the{" "}
          <Link href="/terms" target="_blank" className="text-accent hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" target="_blank" className="text-accent hover:underline">
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      <button className="btn-accent py-2.5" disabled={pending || !agreed}>
        {pending ? "One moment…" : "Agree and continue"}
      </button>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}
