// "METHOD V" in the pixel logo font, with the mint V. Size it with a text-*
// class on className.
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`}>
      Method <span className="wordmark-v">V</span>
    </span>
  );
}
