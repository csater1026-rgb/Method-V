import Link from "next/link";

import { LEGAL } from "@/lib/constants";

// The layout for /terms and /privacy: plain, readable, one column.
export function LegalPage({ title, intro, children }: { title: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-8">
      <p className="eyebrow">Last updated {LEGAL.updated}</p>
      <h1 className="display rise mt-1 text-6xl">{title}</h1>
      <div className="mt-3 text-ink/90">{intro}</div>
      <div className="mt-8 flex flex-col gap-8">{children}</div>
      <p className="mt-10 border-t border-line pt-6 text-sm text-muted">
        Questions? Email <MailLink />. See also the{" "}
        {title === "Terms of Service" ? (
          <Link href="/privacy" className="text-accent hover:underline">
            Privacy Policy
          </Link>
        ) : (
          <Link href="/terms" className="text-accent hover:underline">
            Terms of Service
          </Link>
        )}
        .
      </p>
    </article>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="display text-3xl">{title}</h2>
      <div className="mt-2 flex flex-col gap-3 text-[15px] leading-relaxed text-ink/90 [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </div>
    </section>
  );
}

export function MailLink() {
  return (
    <a href={`mailto:${LEGAL.email}`} className="text-accent hover:underline">
      {LEGAL.email}
    </a>
  );
}
