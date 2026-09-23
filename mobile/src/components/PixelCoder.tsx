import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { useTheme } from "@/theme";

// The Method V mascot from the website: a pixel builder at their desk while
// code types itself on the screen. The code pulses unless the person has
// reduced motion turned on.

const W = 32;
const H = 20;
const ART = [
  "................................",
  "................................",
  "......hhhh......................",
  ".....hhhhhh.......MMMMMMMMMMMM..",
  ".....hhhhss.......MSSSSSSSSSSM..",
  ".....hhhsss.......MSSSSSSSSSSM..",
  "......ssss........MSSSSSSSSSSM..",
  ".......ss.........MSSSSSSSSSSM..",
  ".....tttttt.......MSSSSSSSSSSM..",
  "....tttttttt......MSSSSSSSSSSM..",
  "....tttttttttt....MMMMMMMMMMMM..",
  "....tttttt............MM........",
  "...kppppppp...........MM........",
  "...kkkkkkkkkDDDDDDDDDDDDDDDDDDD.",
  "...k.......k.D...............D..",
  "...k.......k.D...............D..",
  "..kk.......kk.D.............D...",
  "................................",
  "................................",
  "................................",
];
const CODE: [number, number, number][] = [
  [20, 5, 5],
  [21, 6, 6],
  [21, 7, 4],
  [20, 8, 7],
];

export function PixelCoder({ size = 96, label }: { size?: number; label?: string }) {
  const t = useTheme();
  const colors: Record<string, string> = { h: "#6b4a2f", s: "#d9b38c", t: t.accent, p: t.muted, k: t.line, M: t.muted, S: "#06101a", D: t.line };
  const rects: { x: number; y: number; w: number; fill: string }[] = [];
  ART.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end++;
      const fill = colors[row[x]];
      if (fill) rects.push({ x, y, w: end - x, fill });
      x = end;
    }
  });

  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.25, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => loop?.stop();
  }, [pulse]);

  const height = (size * H) / W;
  const code = (
    <Svg width={size} height={height} viewBox={`0 0 ${W} ${H}`}>
      {CODE.map(([x, y, w], i) => (
        <Rect key={i} x={x} y={y} width={w} height={0.6} fill={i % 2 ? t.ink : t.accent} />
      ))}
    </Svg>
  );
  return (
    <View accessible={Boolean(label)} accessibilityLabel={label} style={{ width: size, height }}>
      <Svg width={size} height={height} viewBox={`0 0 ${W} ${H}`}>
        {rects.map((r, i) => (
          <Rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
        ))}
        <Rect x={14} y={10} width={2} height={1} fill="#d9b38c" />
      </Svg>
      <Animated.View style={{ position: "absolute", left: 0, top: 0, opacity: pulse }}>{code}</Animated.View>
    </View>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <PixelCoder size={140} />
    </View>
  );
}
