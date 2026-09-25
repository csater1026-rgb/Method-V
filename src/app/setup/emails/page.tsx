import type { Metadata } from "next";

import { EMAIL_TEMPLATES } from "@/lib/email-templates";

import { CopyButton } from "./CopyButton";

export const metadata: Metadata = { title: "Email templates", robots: { index: false } };

// For whoever runs the site: Method V's sign-in emails, ready to paste into
// Supabase → Authentication → Emails → Templates.
export default function EmailTemplatesPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <p className="eyebrow">Site setup</p>
      <h1 className="display rise text-5xl">Email templates</h1>
      <p className="mt-2 text-muted">
        In Supabase, open <strong className="text-ink">Authentication → Emails → Templates</strong>. For each email below, pick the
        matching template there, copy the subject into <strong className="text-ink">Subject</strong>, copy the message into the
        message box (replace everything in it), and click <strong className="text-ink">Save</strong>.
      </p>
      <ol className="mt-8 flex flex-col gap-10">
        {EMAIL_TEMPLATES.map((t, i) => (
          <li key={t.supabaseName} aria-label={t.supabaseName}>
            <h2 className="display text-3xl">
              {i + 1}. {t.supabaseName}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-3">
              <span className="text-sm text-muted">Subject:</span>
              <span className="min-w-0 flex-1 font-semibold">{t.subject}</span>
              <CopyButton value={t.subject} label="Copy subject" />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-sm text-muted">Message (how it looks):</span>
              <CopyButton value={t.html} label="Copy message" />
            </div>
            <iframe
              title={`${t.supabaseName} preview`}
              sandbox=""
              srcDoc={t.html.replaceAll("{{ .Token }}", "123456").replaceAll("{{ .Email }}", "you@example.com").replaceAll("{{ .NewEmail }}", "new@example.com").replaceAll("{{ .ConfirmationURL }}", "#")}
              className="mt-2 h-[460px] w-full rounded-lg border border-line bg-white"
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
