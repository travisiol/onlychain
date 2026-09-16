import { site } from "@/lib/site";

/**
 * The logo, as supplied by the owner (brand-src/ → scripts/brand.mjs crops
 * it, nothing else is changed):
 *
 *   /brand/logo-light.png  the all-blue lockup, transparent — every white page (header, dialogs)
 *   /brand/mark-light.png  the all-blue rings alone, transparent, square — favicon, small uses
 *   /brand/logo-dark.png   the lockup on black — the landing panel only
 *
 * The brand blue sampled from the file is #01abfc — the site's accent.
 */
export const BRAND_BLUE = "#01abfc";

/** The lockup (rings + ONLYCHAIN), all blue on a transparent background. `width` in px. */
export function Logo({ width = 180, className }: { width?: number; className?: string }) {
  const height = Math.round((width * 679) / 1134);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/logo-light.png" alt={site.name} width={width} height={height} className={`block ${className ?? ""}`} style={{ width, height }} draggable={false} />
  );
}

/** The rings alone, blue on transparent, square. */
export function MarkImg({ size = 40, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/mark-light.png" alt="" width={size} height={size} className={`block ${className ?? ""}`} style={{ width: size, height: size }} draggable={false} aria-hidden="true" />
  );
}
