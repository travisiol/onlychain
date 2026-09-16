import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getAddress, isAddress, verifyMessage } from "viem";
import { publicClient } from "@/lib/server/chainReads";
import { putNonce, takeNonce } from "@/lib/server/db";
import { ensureProfile } from "@/lib/server/store";
import { signInMessage } from "@/lib/signin";
import type { Address, Session } from "@/lib/model";

/**
 * Sign-in with a wallet, kept deliberately small: the server hands out a
 * nonce, the wallet signs a readable message containing it, the server
 * verifies the signature and sets an HMAC-signed session cookie. No
 * passwords, no accounts, no email — a wallet is the identity, the same one
 * that pays and gets paid.
 *
 * Signatures are checked through the chain's public client, so
 * smart-contract wallets (ERC-1271, and ERC-6492 for not-yet-deployed ones)
 * sign in like any EOA.
 */

const SESSION_COOKIE = "onlychain_session";

/**
 * Who runs the site. `OPS_ADDRESSES` is a comma-separated list of wallets.
 * On the local chain with the list unset, every signed-in wallet is ops so
 * the screen can be tried — /ops says so in its header. Never on a public
 * chain: an empty list there means nobody.
 */
export function isOps(address: string): boolean {
  const list = (process.env.OPS_ADDRESSES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return Number(process.env.ONLYCHAIN_CHAIN_ID || process.env.NEXT_PUBLIC_ONLYCHAIN_CHAIN_ID || 4663) === 31337 && process.env.NODE_ENV !== "production";
  return list.includes(address.toLowerCase());
}

export const opsIsOpen = () => (process.env.OPS_ADDRESSES ?? "").trim() === "" && Number(process.env.ONLYCHAIN_CHAIN_ID || process.env.NEXT_PUBLIC_ONLYCHAIN_CHAIN_ID || 4663) === 31337;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NONCE_TTL_MS = 10 * 60 * 1000;

declare global {
  var __onlychainSessionSecret: Buffer | undefined;
}

let warned = false;
function secret(): Buffer {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return Buffer.from(fromEnv, "utf8");
  if (!globalThis.__onlychainSessionSecret) {
    globalThis.__onlychainSessionSecret = randomBytes(32);
    if (!warned) {
      warned = true;
      console.warn("[onlychain] SESSION_SECRET is unset — sessions will not survive a restart.");
    }
  }
  return globalThis.__onlychainSessionSecret;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function issueNonce(): string {
  const nonce = randomBytes(16).toString("hex");
  putNonce(nonce, NONCE_TTL_MS);
  return nonce;
}

export async function verifySignIn(input: { address: string; nonce: string; issuedAt: string; signature: string }): Promise<{ ok: true; address: Address } | { ok: false; reason: string }> {
  if (!isAddress(input.address)) return { ok: false, reason: "Not a valid address." };
  const issued = Date.parse(input.issuedAt);
  if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > NONCE_TTL_MS) return { ok: false, reason: "Sign-in request expired — try again." };
  if (!/^0x[0-9a-fA-F]{130,}$/.test(input.signature) || input.signature.length > 20_000) return { ok: false, reason: "Malformed signature." };
  if (!takeNonce(input.nonce)) return { ok: false, reason: "Nonce unknown or already used — try again." };

  const address = getAddress(input.address);
  const message = signInMessage(address, input.nonce, input.issuedAt);
  const signature = input.signature as `0x${string}`;
  let valid = false;
  try {
    // EOAs, ERC-1271 contract wallets and ERC-6492 pre-deploy signatures — viem asks the chain when needed
    valid = await publicClient().verifyMessage({ address, message, signature });
  } catch {
    // RPC down: plain EOA recovery still lets people in
    valid = await verifyMessage({ address, message, signature }).catch(() => false);
  }
  if (!valid) return { ok: false, reason: "Signature does not match the address." };
  return { ok: true, address };
}

export async function setSession(address: Address): Promise<Session> {
  ensureProfile(address);
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ a: address, e: expiresAt }), "utf8").toString("base64url");
  const jar = await cookies();
  jar.set(SESSION_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
  return { address, expiresAt };
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  const expected = sign(payload);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const { a, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { a: string; e: number };
    if (!isAddress(a) || typeof e !== "number" || e < Date.now()) return null;
    return { address: getAddress(a), expiresAt: e };
  } catch {
    return null;
  }
}

/** Route-handler helper: the session or a 401 response. */
export async function requireSession(): Promise<{ session: Session } | { response: Response }> {
  const session = await getSession();
  if (!session) return { response: Response.json({ error: "Sign in with your wallet first." }, { status: 401 }) };
  return { session };
}

/** The session of an operator, or a 401 / 403. */
export async function requireOps(): Promise<{ session: Session } | { response: Response }> {
  const auth = await requireSession();
  if ("response" in auth) return auth;
  if (!isOps(auth.session.address)) return { response: Response.json({ error: "Operators only." }, { status: 403 }) };
  return auth;
}
