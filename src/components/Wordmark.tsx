import { V_HEIGHT, V_WIDTH, pixelVRects } from "@/lib/pixel-v";

const V = pixelVRects();

// "METHOD" in the logo font, then the pixel V (mint, blue pixel shadow).
// Size it with a text-* class on className.
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`}>
      Method<span className="sr-only"> V</span>
      <svg viewBox={`0 0 ${V_WIDTH} ${V_HEIGHT}`} className="wordmark-v" shapeRendering="crispEdges" aria-hidden>
        {V.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
        ))}
      </svg>
    </span>
  );
}
