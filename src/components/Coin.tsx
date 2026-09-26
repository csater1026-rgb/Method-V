import { COIN_HEIGHT, COIN_WIDTH, pixelCoinRects } from "@/lib/pixel-coin";

const RECTS = pixelCoinRects();

// The credit coin (mint, stamped with the logo's V), sized to the text
// around it. Put it right before a number of credits.
export function Coin({ className = "" }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${COIN_WIDTH} ${COIN_HEIGHT}`} className={`coin ${className}`} shapeRendering="crispEdges" aria-hidden>
      {RECTS.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
      ))}
    </svg>
  );
}
