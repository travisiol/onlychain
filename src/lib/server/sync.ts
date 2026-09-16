import "server-only";
import { parseEventLogs, type Hex, type Log } from "viem";
import { onlyChainAbi } from "@/lib/abi/onlychain";
import { invalidate, publicClient } from "@/lib/server/chainReads";
import { serverChainEnv } from "@/lib/server/env";
import { getMeta, setMeta } from "@/lib/server/db";
import { getProfile, hasMessageFrom, insertMessage, newId, upsertEvent } from "@/lib/server/store";
import type { ChainEvent } from "@/lib/model";

/**
 * The chain is the source of truth for money; this copies its events into
 * SQLite so the site can list them (notifications, earnings, who ever
 * subscribed to whom) without scanning logs on every page.
 *
 * Two entry points:
 *   - syncTx(hash): right after the browser confirms a transaction — parses
 *     that receipt, so the page reflects the payment immediately.
 *   - syncRecent(): pull from the stored cursor to the head, in bounded
 *     chunks, throttled to once every few seconds. Called by the routes that
 *     list events. Nothing needs to run in the background.
 */

const CURSOR_KEY = "events_cursor";
const CHUNK = 2_000;
const MAX_CHUNKS = 10;
const THROTTLE_MS = 6_000;
let lastRecent = 0;
let inflight: Promise<number> | null = null;

function toEvent(log: Log & { eventName: string; args: Record<string, unknown> }, ts: number): ChainEvent | null {
  const id = `${log.transactionHash}:${log.logIndex}`;
  const base = { id, block: Number(log.blockNumber), ts, txHash: log.transactionHash as string };
  const a = log.args;
  switch (log.eventName) {
    case "Subscribed":
      return { ...base, kind: "subscribed", creator: a.creator as `0x${string}`, fan: a.fan as `0x${string}`, amount: String(a.paid), fee: String(a.fee), extra: { months: Number(a.months), until: Number(a.until) } };
    case "Tipped":
      return { ...base, kind: "tipped", creator: a.creator as `0x${string}`, fan: a.fan as `0x${string}`, amount: String(a.amount), fee: String(a.fee), extra: { ref: String(a.ref) } };
    case "Unlocked":
      return { ...base, kind: "unlocked", creator: a.creator as `0x${string}`, fan: a.fan as `0x${string}`, amount: String(a.paid), fee: String(a.fee), extra: { contentId: String(a.contentId) } };
    case "PlanSet":
      return { ...base, kind: "plan", creator: a.creator as `0x${string}`, fan: a.creator as `0x${string}`, amount: String(a.monthlyPrice), fee: "0", extra: { open: Boolean(a.open) } };
    default:
      return null;
  }
}

/** The creator's welcome message, once, the first time a wallet subscribes (trials included). */
function welcome(creator: string, fan: string): void {
  const p = getProfile(creator);
  if (!p?.welcomeMessage || hasMessageFrom(creator, fan)) return;
  insertMessage({ id: newId(), sender: creator, recipient: fan, text: p.welcomeMessage, mediaId: null, price: "0" });
}

async function blockTimestamps(blocks: bigint[]): Promise<Map<bigint, number>> {
  const client = publicClient();
  const out = new Map<bigint, number>();
  await Promise.all(
    [...new Set(blocks)].map(async (n) => {
      const b = await client.getBlock({ blockNumber: n });
      out.set(n, Number(b.timestamp) * 1000);
    }),
  );
  return out;
}

async function ingest(logs: Log[]): Promise<ChainEvent[]> {
  const env = serverChainEnv();
  const parsed = parseEventLogs({ abi: onlyChainAbi, logs, strict: false }).filter((l) => l.address.toLowerCase() === env.hub!.toLowerCase());
  if (parsed.length === 0) return [];
  const stamps = await blockTimestamps(parsed.map((l) => l.blockNumber!));
  const fresh: ChainEvent[] = [];
  for (const log of parsed) {
    const ev = toEvent(log as never, stamps.get(log.blockNumber!) ?? Date.now());
    if (ev && upsertEvent(ev)) fresh.push(ev);
  }
  const touched = new Set<string>();
  for (const ev of fresh) {
    touched.add(ev.creator);
    touched.add(ev.fan);
    if (ev.kind === "subscribed") welcome(ev.creator, ev.fan);
  }
  if (touched.size) invalidate(...touched);
  return fresh;
}

/** Index one confirmed transaction. Returns the events it contained (all of them, new or already known). */
export async function syncTx(hash: Hex): Promise<{ events: ChainEvent[]; status: "success" | "reverted" | "unknown" }> {
  const env = serverChainEnv();
  if (!env.hub) return { events: [], status: "unknown" };
  const receipt = await publicClient().waitForTransactionReceipt({ hash, timeout: 30_000, confirmations: 1 }).catch(() => null);
  if (!receipt) return { events: [], status: "unknown" };
  if (receipt.status !== "success") return { events: [], status: "reverted" };
  const events = await ingest(receipt.logs);
  // also return known ones so the caller sees the whole receipt
  if (events.length === 0) {
    const parsed = parseEventLogs({ abi: onlyChainAbi, logs: receipt.logs, strict: false });
    const stamps = parsed.length ? await blockTimestamps(parsed.map((l) => l.blockNumber!)) : new Map<bigint, number>();
    const known = parsed.map((l) => toEvent(l as never, stamps.get(l.blockNumber!) ?? Date.now())).filter((e): e is ChainEvent => e !== null);
    invalidate(...known.flatMap((e) => [e.creator, e.fan]));
    return { events: known, status: "success" };
  }
  return { events, status: "success" };
}

/** Pull new events from the cursor to the head. Cheap when nothing happened. */
export async function syncRecent(force = false): Promise<number> {
  const env = serverChainEnv();
  if (!env.hub) return 0;
  if (!force && Date.now() - lastRecent < THROTTLE_MS) return 0;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const client = publicClient();
      const head = Number(await client.getBlockNumber());
      const stored = getMeta(CURSOR_KEY);
      let from = stored ? Number(stored) + 1 : Math.max(0, head - 50_000);
      let count = 0;
      for (let i = 0; i < MAX_CHUNKS && from <= head; i++) {
        const to = Math.min(head, from + CHUNK - 1);
        const logs = await client.getLogs({ address: env.hub!, fromBlock: BigInt(from), toBlock: BigInt(to) });
        count += (await ingest(logs)).length;
        setMeta(CURSOR_KEY, String(to));
        from = to + 1;
      }
      lastRecent = Date.now();
      return count;
    } catch (err) {
      console.warn("[onlychain] event sync failed:", (err as Error).message);
      lastRecent = Date.now();
      return 0;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function syncStatus(): { cursor: number | null } {
  const c = getMeta(CURSOR_KEY);
  return { cursor: c ? Number(c) : null };
}
