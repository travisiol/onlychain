"use client";

import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { api } from "@/lib/client/api";
import { site } from "@/lib/site";

export type PriceInfo = { ethPerOnly: string | null; ethUsd: number | null; usdPerOnly: number | null; source: "hermes" | "onchain" | "env" | "none"; ethUsdAt: number | null; at: number };

/** The site-wide price, refreshed every minute; `usdPerOnly` is null when nothing can be known. */
export function usePrice() {
  return useQuery({ queryKey: ["price"], queryFn: () => api<PriceInfo>("/api/price"), staleTime: 60_000, refetchInterval: 60_000 });
}

/** "≈ $12.34" for a wei amount of ONLY, or "" when unknown. */
export function usd(wei: string | bigint | null | undefined, price: PriceInfo | undefined): string {
  if (!price?.usdPerOnly || wei === null || wei === undefined) return "";
  const n = Number(formatUnits(BigInt(wei), site.token.decimals)) * price.usdPerOnly;
  if (!Number.isFinite(n)) return "";
  const s = n >= 100 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n >= 1 ? n.toFixed(2) : n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return `≈ $${s}`;
}
