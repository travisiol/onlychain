"use client";

import { usePrice, usd } from "@/lib/client/price";

/** The dollar shadow next to an ONLY amount. Renders nothing when the price is unknown. */
export function Usd({ wei, className = "text-ink-3" }: { wei: string | bigint | null | undefined; className?: string }) {
  const price = usePrice();
  const text = usd(wei, price.data);
  if (!text) return null;
  return <span className={`text-[12px] font-normal ${className}`} title={price.data?.source === "env" ? "Demo rate (ONLYCHAIN_ETH_USD)" : price.data?.source === "onchain" ? "Last ETH/USD print pushed on-chain (may be old)" : "Pyth"}>{text}</span>;
}
