import { useId } from "react";

import { MV_COLORS as C, MV_INNER, MV_M, MV_M_WIDTH, MV_OUTER, MV_SHADOW_DY, MV_V, MV_V_WIDTH, MV_VIEW } from "@/lib/methodium-icon";

// Methodium, Method V's credits: a mint hexagon token reading "Mv"
// (src/lib/methodium-icon.ts), sized to the text around it. Put it right
// before a number of credits.
export function Coin({ className = "" }: { className?: string }) {
  const edge = `mv-edge-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox={`0 0 ${MV_VIEW.width} ${MV_VIEW.height}`} className={`coin ${className}`} aria-hidden>
      <defs>
        <linearGradient id={edge} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.edgeTop} />
          <stop offset="1" stopColor={C.edgeBottom} />
        </linearGradient>
      </defs>
      <polygon points={MV_OUTER} fill={C.shadow} transform={`translate(0 ${MV_SHADOW_DY})`} />
      <polygon points={MV_OUTER} fill={`url(#${edge})`} />
      <polygon points={MV_INNER} fill={C.face} />
      <g fill="none" stroke={C.symbol} strokeLinejoin="miter" strokeLinecap="butt">
        <polyline points={MV_M} strokeWidth={MV_M_WIDTH} />
        <polyline points={MV_V} strokeWidth={MV_V_WIDTH} />
      </g>
    </svg>
  );
}
