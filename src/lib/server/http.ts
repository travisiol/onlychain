import "server-only";

/** An error the client is meant to read: message + HTTP status. */
export class ServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Parse a JSON body, tolerating an empty one. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const text = await req.text();
    if (!text.trim()) return {};
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new ServiceError("Body must be JSON.");
  }
}

/** Run a handler and turn thrown ServiceErrors into JSON responses. */
export async function handle(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ServiceError) return Response.json({ error: err.message }, { status: err.status });
    console.error(err);
    return Response.json({ error: "Something went wrong on the server." }, { status: 500 });
  }
}

export const json = (data: unknown, init?: ResponseInit) => Response.json(data, init);

/**
 * Sliding-window rate limit, in memory (per process — enough to stop a
 * script from spamming uploads or DMs; a multi-instance deployment gets
 * per-instance limits, still a ceiling). ONLYCHAIN_RATE_LIMIT=0 disables it.
 */
const hits = new Map<string, number[]>();
export function rateLimit(key: string, limit: number, windowMs: number): void {
  if (process.env.ONLYCHAIN_RATE_LIMIT === "0") return;
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) throw new ServiceError("Too many requests — slow down a little.", 429);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 20_000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
}

/** A rough client identity for unauthenticated routes. */
export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

export function str(v: unknown, max = 10_000): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

export function int(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** A decimal string of wei (digits only), or throw. */
export function wei(v: unknown, label = "amount"): string {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  if (!/^\d{1,40}$/.test(s)) throw new ServiceError(`Bad ${label}.`);
  return BigInt(s).toString();
}
