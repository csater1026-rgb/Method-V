import { logoGradient, logoLetter } from "@/lib/app-logo";

// An app's logo: the square picture its builder added, or else its first
// letter on its own colors (src/lib/app-logo.ts). Rounded like an app icon.
export function AppLogo({ name, src, size, className = "", style }: { name: string; src: string | null | undefined; size: number; className?: string; style?: React.CSSProperties }) {
  const box: React.CSSProperties = { width: size, height: size, borderRadius: Math.round(size * 0.24), ...style };
  if (src) {
    // Logos come from Supabase Storage, so a plain img is simplest here.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} data-app-logo="" className={`shrink-0 bg-white object-cover ${className}`} style={box} />;
  }
  const [from, to] = logoGradient(name);
  return (
    <span
      aria-hidden
      data-app-logo=""
      className={`display flex shrink-0 items-center justify-center text-white ${className}`}
      style={{ ...box, background: `linear-gradient(135deg, ${from}, ${to})`, fontSize: Math.round(size * 0.56), lineHeight: 1 }}
    >
      {logoLetter(name)}
    </span>
  );
}
