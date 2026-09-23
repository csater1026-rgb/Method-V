import { PixelCoder } from "./PixelCoder";

// Shown while a page or a post is loading: the pixel builder hard at work.
export function LoadingCoder({ message = "Loading…", className = "" }: { message?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center justify-center gap-4 text-center ${className}`}>
      <PixelCoder size={168} />
      <p className="font-mono text-xs tracking-widest text-muted uppercase">{message}</p>
    </div>
  );
}
