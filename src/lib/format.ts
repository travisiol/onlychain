import { formatUnits, parseUnits } from "viem";
import { site } from "@/lib/site";

/** "25 ONLY", "0.5 ONLY", "1,250 ONLY" — wei in, trimmed decimals out. */
export function fmtOnly(wei: string | bigint | undefined | null, opts: { symbol?: boolean; maxDecimals?: number } = {}): string {
  const v = BigInt(wei ?? 0);
  const raw = formatUnits(v, site.token.decimals);
  const [int, frac = ""] = raw.split(".");
  const max = opts.maxDecimals ?? (v >= parseUnits("100", site.token.decimals) ? 0 : 2);
  const trimmed = frac.slice(0, max).replace(/0+$/, "");
  const intFmt = Number(int).toLocaleString("en-US");
  const num = trimmed ? `${intFmt}.${trimmed}` : intFmt;
  return opts.symbol === false ? num : `${num} ${site.token.symbol}`;
}

/** Parse a user-typed amount ("12.5") into wei, or null. */
export function parseOnly(input: string): bigint | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d*(\.\d{0,18})?$/.test(s) || s === "" || s === ".") return null;
  try {
    return parseUnits(s, site.token.decimals);
  } catch {
    return null;
  }
}

export const shortAddress = (a: string, n = 4) => `${a.slice(0, 2 + n)}…${a.slice(-n)}`;

export function timeAgo(ms: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  const date = new Date(ms);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d > 300 ? { year: "numeric" } : {}) });
}

export function fmtDate(secOrMs: number): string {
  const ms = secOrMs < 1e12 ? secOrMs * 1000 : secOrMs;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function daysLeft(untilSec: number, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((untilSec * 1000 - now) / 86_400_000));
}

export const displayName = (p: { displayName: string; handle: string | null; address: string }) => p.displayName || (p.handle ? `@${p.handle}` : shortAddress(p.address));
export const handleOf = (p: { handle: string | null; address: string }) => (p.handle ? `@${p.handle}` : shortAddress(p.address, 6));
export const profileHref = (p: { handle: string | null; address: string }) => `/${p.handle ?? p.address}`;

export const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K` : String(n));
