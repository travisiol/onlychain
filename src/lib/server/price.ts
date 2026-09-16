import "server-only";
import { formatEther } from "viem";
import { curveAbi } from "@/lib/abi/onlychain";
import { publicClient } from "@/lib/server/chainReads";
import { serverChainEnv } from "@/lib/server/env";
import { normalizeReserves } from "@/lib/curve";

/**
 * "What is 25 ONLY worth?" — a display aid, never a peg. ONLY→ETH is the
 * curve's marginal price (quote reserve / token reserve); ETH→USD comes from
 * Pyth: Hermes when a key is set (fresh), otherwise the last price pushed
 * on-chain (getPriceUnsafe, may be old — the age is returned), otherwise
 * ONLYCHAIN_ETH_USD for the local demo. Cached one minute.
 */

/** Pyth on Robinhood Chain and the ETH/USD feed id (see memory: pyth-on-robinhood-chain). */
const PYTH_ADDRESS = (process.env.PYTH_ADDRESS?.trim() || "0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a") as `0x${string}`;
const ETH_USD_FEED = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace" as const;
const HERMES = (process.env.PYTH_HERMES_URL?.trim() || "https://hermes.pyth.network").replace(/\/$/, "");

const pythAbi = [
  {
    type: "function",
    name: "getPriceUnsafe",
    stateMutability: "view",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [{ type: "tuple", components: [{ name: "price", type: "int64" }, { name: "conf", type: "uint64" }, { name: "expo", type: "int32" }, { name: "publishTime", type: "uint256" }] }],
  },
] as const;

export type PriceInfo = {
  /** ETH per 1 ONLY, as a decimal string. null when no curve is configured. */
  ethPerOnly: string | null;
  ethUsd: number | null;
  usdPerOnly: number | null;
  source: "hermes" | "onchain" | "env" | "none";
  /** Unix ms of the ETH/USD print. */
  ethUsdAt: number | null;
  at: number;
};

let cache: { at: number; value: PriceInfo } | null = null;

async function ethUsdFromHermes(): Promise<{ price: number; at: number } | null> {
  const key = process.env.PYTH_API_KEY?.trim();
  if (!key) return null;
  try {
    const res = await fetch(`${HERMES}/v2/updates/price/latest?ids[]=${ETH_USD_FEED}`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { parsed?: { price: { price: string; expo: number; publish_time: number } }[] };
    const p = body.parsed?.[0]?.price;
    if (!p) return null;
    return { price: Number(p.price) * 10 ** p.expo, at: p.publish_time * 1000 };
  } catch {
    return null;
  }
}

async function ethUsdOnChain(): Promise<{ price: number; at: number } | null> {
  const env = serverChainEnv();
  if (env.chainId === 31337) return null;
  try {
    const r = await publicClient().readContract({ address: PYTH_ADDRESS, abi: pythAbi, functionName: "getPriceUnsafe", args: [ETH_USD_FEED] });
    return { price: Number(r.price) * 10 ** r.expo, at: Number(r.publishTime) * 1000 };
  } catch {
    return null;
  }
}

export async function priceInfo(): Promise<PriceInfo> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const env = serverChainEnv();
  let ethPerOnly: string | null = null;
  const curve = process.env.NEXT_PUBLIC_ONLYCHAIN_CURVE?.trim();
  if (curve && /^0x[0-9a-fA-F]{40}$/.test(curve)) {
    try {
      const [a, b] = await publicClient().readContract({ address: curve as `0x${string}`, abi: curveAbi, functionName: "getReserves" });
      const r = normalizeReserves(a, b);
      // marginal price: ETH per token = quote / tokens (both 18 decimals) — as a decimal with 18 places
      const scaled = (r.quote * 10n ** 18n) / (r.tokens === 0n ? 1n : r.tokens);
      ethPerOnly = formatEther(scaled);
    } catch {
      ethPerOnly = null;
    }
  }
  let ethUsd: { price: number; at: number } | null = await ethUsdFromHermes();
  let source: PriceInfo["source"] = ethUsd ? "hermes" : "none";
  if (!ethUsd) {
    ethUsd = await ethUsdOnChain();
    if (ethUsd) source = "onchain";
  }
  if (!ethUsd) {
    const fallback = Number(process.env.ONLYCHAIN_ETH_USD ?? process.env.NEXT_PUBLIC_ONLYCHAIN_ETH_USD ?? "");
    if (Number.isFinite(fallback) && fallback > 0) {
      ethUsd = { price: fallback, at: Date.now() };
      source = "env";
    }
  }
  void env;
  const value: PriceInfo = {
    ethPerOnly,
    ethUsd: ethUsd?.price ?? null,
    usdPerOnly: ethPerOnly !== null && ethUsd ? Number(ethPerOnly) * ethUsd.price : null,
    source,
    ethUsdAt: ethUsd?.at ?? null,
    at: Date.now(),
  };
  cache = { at: Date.now(), value };
  return value;
}
