import { OFFICIAL_HANDLE } from "@/lib/constants";
import { V_HEIGHT, V_WIDTH, pixelVRects } from "@/lib/pixel-v";

const V = pixelVRects();

// Someone's @handle. Method V's own account ends in the logo's pixel V
// (screen readers still hear "@methodv").
export function Handle({ username }: { username: string }) {
  if (username !== OFFICIAL_HANDLE) return <>@{username}</>;
  return (
    <span className="whitespace-nowrap">
      @{OFFICIAL_HANDLE.slice(0, -1)}
      <span className="sr-only">{OFFICIAL_HANDLE.slice(-1)}</span>
      <svg viewBox={`0 0 ${V_WIDTH} ${V_HEIGHT}`} className="handle-v" shapeRendering="crispEdges" aria-hidden>
        {V.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
        ))}
      </svg>
    </span>
  );
}
