"use client";

import Link from "next/link";
import { useActionState } from "react";

import { updateProfile, type ProfileState } from "@/app/actions";
import { ROLES } from "@/lib/constants";
import type { Profile } from "@/lib/types";

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfile, { status: "idle" });

  return (
    <form action={action} className="mt-6 flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Username" hint="Lowercase letters, numbers and _">
          <input name="username" defaultValue={profile.username} required pattern="[a-z0-9_]{3,24}" className="field" />
        </Field>
        <Field label="Display name">
          <input name="display_name" defaultValue={profile.display_name} maxLength={60} className="field" />
        </Field>
      </div>

      <Field label="Bio" hint="Up to 280 characters">
        <textarea name="bio" defaultValue={profile.bio} maxLength={280} rows={3} className="field" />
      </Field>

      <fieldset>
        <legend className="text-sm font-medium">I am…</legend>
        <p className="text-xs text-muted">Shown on your profile so people know how to work with you.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <label
              key={r.slug}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/10"
            >
              <input
                type="checkbox"
                name="roles"
                value={r.slug}
                defaultChecked={profile.roles.includes(r.slug)}
                className="accent-[var(--color-accent)]"
              />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Skills" hint="Comma separated, e.g. Next.js, Figma, Supabase">
        <input name="skills" defaultValue={profile.skills.join(", ")} className="field" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Website">
          <input name="website_url" type="url" defaultValue={profile.website_url ?? ""} placeholder="https://" className="field" />
        </Field>
        <Field label="LinkedIn">
          <input
            name="linkedin_url"
            type="url"
            defaultValue={profile.linkedin_url ?? ""}
            placeholder="https://linkedin.com/in/…"
            className="field"
          />
        </Field>
        <Field label="X handle">
          <input name="x_handle" defaultValue={profile.x_handle ?? ""} placeholder="@you" className="field" />
        </Field>
        <Field label="GitHub username">
          <input name="github_handle" defaultValue={profile.github_handle ?? ""} className="field" />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-accent" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </button>
        {state.status === "saved" && (
          <span className="text-sm text-accent">
            Saved.{" "}
            <Link href="/" className="underline">
              Back to Drops
            </Link>
          </span>
        )}
        {state.status === "error" && <span className="text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">
        {label} {hint && <span className="font-normal text-muted">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}
