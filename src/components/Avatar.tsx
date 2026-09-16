import { displayName } from "@/lib/format";

type Props = { profile: { avatar: string | null; hue: number; displayName: string; handle: string | null; address: string }; size?: number; className?: string; ring?: boolean };

/** A round avatar; without an image, a gradient in the wallet's hue with the initial. */
export function Avatar({ profile, size = 40, className, ring = false }: Props) {
  const name = displayName(profile);
  const initial = (profile.displayName || profile.handle || "0x").trim().charAt(0).toUpperCase();
  const style: React.CSSProperties = { width: size, height: size, fontSize: Math.max(10, size * 0.4) };
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white ${ring ? "ring-4 ring-white" : ""} ${className ?? ""}`}
      style={{ ...style, background: `linear-gradient(135deg, hsl(${profile.hue} 70% 62%), hsl(${(profile.hue + 50) % 360} 65% 45%))` }}
      title={name}
    >
      {profile.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar} alt="" width={size} height={size} className="h-full w-full object-cover" draggable={false} />
      ) : (
        initial
      )}
    </span>
  );
}
