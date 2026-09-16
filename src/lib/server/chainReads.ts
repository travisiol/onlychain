import "server-only";
import { createPublicClient, getAddress, http, keccak256, toBytes, type Address, type PublicClient } from "viem";
import { onlyChainAbi, erc20Abi } from "@/lib/abi/onlychain";
import { chainFor } from "@/lib/chain";
import { serverChainEnv } from "@/lib/server/env";
import type { Plan } from "@/lib/model";

/**
 * What the server asks the chain. Every access decision on the site ends
 * here: is this wallet subscribed to that creator right now, has it paid for
 * that content. Answers are cached for a few seconds per key; a confirmed
 * transaction (sync.ts) drops the cache for the wallets it touched.
 */

declare global {
  var __onlychainClient: { key: string; client: PublicClient } | undefined;
}

export function publicClient(): PublicClient {
  const env = serverChainEnv();
  const key = `${env.chainId}|${env.rpcUrl}`;
  if (!globalThis.__onlychainClient || globalThis.__onlychainClient.key !== key) {
    const client = createPublicClient({ chain: chainFor(env.chainId, env.rpcUrl), transport: http(env.rpcUrl, { timeout: 8_000 }), cacheTime: 0 }) as PublicClient;
    globalThis.__onlychainClient = { key, client };
  }
  return globalThis.__onlychainClient.client;
}

export const chainConfigured = () => serverChainEnv().hub !== null;

/** keccak256("post:<id>") / keccak256("msg:<id>") — the bytes32 the fan pays against. */
export const contentIdOf = (kind: "post" | "msg", id: string): `0x${string}` => keccak256(toBytes(`${kind}:${id}`));

// ─────────────────────────────── cache ───────────────────────────────

const TTL_MS = 12_000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 5000) {
    const cutoff = Date.now() - TTL_MS;
    for (const [k, v] of cache) if (v.at < cutoff) cache.delete(k);
  }
  return value;
}

/** Forget everything known about a wallet (both as fan and as creator). */
export function invalidate(...addresses: string[]): void {
  const needles = addresses.map((a) => a.toLowerCase());
  for (const key of cache.keys()) {
    const k = key.toLowerCase();
    if (needles.some((n) => k.includes(n))) cache.delete(key);
  }
}

// ─────────────────────────────── reads ───────────────────────────────

type PlanTuple = readonly [bigint, boolean, number, number, number, number];

/** `plans(creator)` → the site's Plan; an all-zero tuple means the wallet never set one. */
function planFromTuple(r: PlanTuple): Plan {
  const [monthlyPrice, open, discount3Bps, discount6Bps, discount12Bps, trialDays] = r;
  if (monthlyPrice === 0n && !open) return null;
  return { monthlyPrice: monthlyPrice.toString(), open, discount3Bps: Number(discount3Bps), discount6Bps: Number(discount6Bps), discount12Bps: Number(discount12Bps), trialDays: Number(trialDays) };
}

/** Whether the fan may start the creator's free trial right now. */
export async function trialAvailable(creator: string, fan: string): Promise<boolean> {
  const env = serverChainEnv();
  if (!env.hub) return false;
  const c = getAddress(creator);
  const f = getAddress(fan);
  if (c === f) return false;
  return cached(`trial:${c}:${f}`, () => publicClient().readContract({ address: env.hub!, abi: onlyChainAbi, functionName: "trialAvailable", args: [c, f] }));
}

export async function subscribedUntil(creator: string, fan: string): Promise<number> {
  const env = serverChainEnv();
  if (!env.hub) return 0;
  const c = getAddress(creator);
  const f = getAddress(fan);
  if (c === f) return Number.MAX_SAFE_INTEGER;
  return cached(`sub:${c}:${f}`, async () => {
    const until = await publicClient().readContract({ address: env.hub!, abi: onlyChainAbi, functionName: "subscribedUntil", args: [c, f] });
    return Number(until);
  });
}

export async function isSubscribed(creator: string, fan: string): Promise<boolean> {
  return (await subscribedUntil(creator, fan)) > Math.floor(Date.now() / 1000);
}

export async function unlockedAmount(fan: string, contentId: `0x${string}`): Promise<bigint> {
  const env = serverChainEnv();
  if (!env.hub) return 0n;
  const f = getAddress(fan);
  return cached(`unlock:${f}:${contentId}`, () => publicClient().readContract({ address: env.hub!, abi: onlyChainAbi, functionName: "unlockedAmount", args: [f, contentId] }));
}

export async function planOf(creator: string): Promise<Plan> {
  const env = serverChainEnv();
  if (!env.hub) return null;
  const c = getAddress(creator);
  return cached(`plan:${c}`, async () => {
    const r = await publicClient().readContract({ address: env.hub!, abi: onlyChainAbi, functionName: "plans", args: [c] });
    return planFromTuple(r);
  });
}

/** Plans for many creators in one multicall (falls back to single reads on a chain without Multicall3). */
export async function plansOf(creators: string[]): Promise<Map<string, Plan>> {
  const out = new Map<string, Plan>();
  const env = serverChainEnv();
  if (!env.hub || creators.length === 0) return out;
  const unique = [...new Set(creators.map((c) => getAddress(c)))];
  const missing = unique.filter((c) => {
    const hit = cache.get(`plan:${c}`);
    if (hit && Date.now() - hit.at < TTL_MS) {
      out.set(c, hit.value as Plan);
      return false;
    }
    return true;
  });
  if (missing.length > 0) {
    const results = await multicallOrEach(
      missing.map((c) => ({ address: env.hub!, abi: onlyChainAbi, functionName: "plans" as const, args: [c] as const })),
    );
    missing.forEach((c, i) => {
      const r = results[i] as PlanTuple | null;
      const plan: Plan = r ? planFromTuple(r) : null;
      cache.set(`plan:${c}`, { at: Date.now(), value: plan });
      out.set(c, plan);
    });
  }
  return out;
}

/** `subscribedUntil` for one fan against many creators. */
export async function subscriptionsOf(fan: string, creators: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const env = serverChainEnv();
  if (!env.hub || creators.length === 0) return out;
  const f = getAddress(fan);
  const unique = [...new Set(creators.map((c) => getAddress(c)))];
  const missing = unique.filter((c) => {
    const hit = cache.get(`sub:${c}:${f}`);
    if (hit && Date.now() - hit.at < TTL_MS) {
      out.set(c, hit.value as number);
      return false;
    }
    return true;
  });
  if (missing.length > 0) {
    const results = await multicallOrEach(
      missing.map((c) => ({ address: env.hub!, abi: onlyChainAbi, functionName: "subscribedUntil" as const, args: [c, f] as const })),
    );
    missing.forEach((c, i) => {
      const until = Number((results[i] as bigint | null) ?? 0n);
      cache.set(`sub:${c}:${f}`, { at: Date.now(), value: until });
      out.set(c, until);
    });
  }
  return out;
}

/** `subscribedUntil` for one creator against many fans. */
export async function subscribersOf(creator: string, fans: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const env = serverChainEnv();
  if (!env.hub || fans.length === 0) return out;
  const c = getAddress(creator);
  const unique = [...new Set(fans.map((f) => getAddress(f)))];
  const results = await multicallOrEach(unique.map((f) => ({ address: env.hub!, abi: onlyChainAbi, functionName: "subscribedUntil" as const, args: [c, f] as const })));
  unique.forEach((f, i) => {
    const until = Number((results[i] as bigint | null) ?? 0n);
    cache.set(`sub:${c}:${f}`, { at: Date.now(), value: until });
    out.set(f, until);
  });
  return out;
}

export async function earnedOf(creator: string): Promise<bigint> {
  const env = serverChainEnv();
  if (!env.hub) return 0n;
  const c = getAddress(creator);
  return cached(`earned:${c}`, () => publicClient().readContract({ address: env.hub!, abi: onlyChainAbi, functionName: "earned", args: [c] }));
}

export async function spentOf(fan: string): Promise<bigint> {
  const env = serverChainEnv();
  if (!env.hub) return 0n;
  const f = getAddress(fan);
  return cached(`spent:${f}`, () => publicClient().readContract({ address: env.hub!, abi: onlyChainAbi, functionName: "spent", args: [f] }));
}

export type HubInfo = { hub: Address; token: Address; feeBps: number; feeRecipient: Address; burns: boolean; tokenSymbol: string; tokenName: string; decimals: number; totalSupply: string };

const BURN_ADDRESSES = new Set(["0x000000000000000000000000000000000000dead", "0x0000000000000000000000000000000000000000"]);

/** The immutables of the deployed hub and the token it pays in. Cached for a minute — they never change. */
export async function hubInfo(): Promise<HubInfo | null> {
  const env = serverChainEnv();
  if (!env.hub) return null;
  const hit = cache.get("hubinfo");
  if (hit && Date.now() - hit.at < 60_000) return hit.value as HubInfo;
  try {
    const client = publicClient();
    const [token, feeBps, feeRecipient] = await Promise.all([
      client.readContract({ address: env.hub, abi: onlyChainAbi, functionName: "token" }),
      client.readContract({ address: env.hub, abi: onlyChainAbi, functionName: "feeBps" }),
      client.readContract({ address: env.hub, abi: onlyChainAbi, functionName: "feeRecipient" }),
    ]);
    const [tokenSymbol, tokenName, decimals, totalSupply] = await Promise.all([
      client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: token, abi: erc20Abi, functionName: "name" }),
      client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
      client.readContract({ address: token, abi: erc20Abi, functionName: "totalSupply" }),
    ]);
    const info: HubInfo = { hub: env.hub, token, feeBps: Number(feeBps), feeRecipient, burns: BURN_ADDRESSES.has(feeRecipient.toLowerCase()), tokenSymbol, tokenName, decimals: Number(decimals), totalSupply: totalSupply.toString() };
    cache.set("hubinfo", { at: Date.now(), value: info });
    return info;
  } catch {
    return null;
  }
}

// ─────────────────────────────── helpers ───────────────────────────────

type Call = { address: Address; abi: typeof onlyChainAbi; functionName: "plans" | "subscribedUntil"; args: readonly unknown[] };

async function multicallOrEach(calls: Call[]): Promise<unknown[]> {
  const client = publicClient();
  if (client.chain?.contracts?.multicall3) {
    try {
      const res = (await client.multicall({ contracts: calls as never, allowFailure: true })) as { status: string; result?: unknown }[];
      return res.map((r) => (r.status === "success" ? (r.result ?? null) : null));
    } catch {
      /* fall through to single reads */
    }
  }
  return Promise.all(calls.map((c) => client.readContract(c as never).catch(() => null)));
}
