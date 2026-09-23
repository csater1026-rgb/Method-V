"use client";

// Switches between light and dark. Until someone taps it the app follows the
// phone's setting; after that the choice is kept in a cookie so the server
// renders the right theme straight away (no flash).
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const current =
      root.dataset.theme ?? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    const next = current === "light" ? "dark" : "light";
    root.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark"
      title="Light / dark"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink hover:border-accent"
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
      </svg>
    </button>
  );
}
