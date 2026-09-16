/**
 * Preflight before pointing the site at the real coin:
 *
 *   npm run go-live                       # reads .env.production, then .env.local
 *   ENV_FILE=.env.vercel npm run go-live  # or any file
 *
 * Checks, against the RPC: the chain answers with the expected id; the token
 * address has code and answers name/symbol/decimals/totalSupply; the hub has
 * code, its `token()` is that token, its fee and recipient are printed; the
 * curve (if set) answers getReserves and whether it graduated; the site's
 * own copy (site.ts feeBps) matches the hub. Exit code 1 if anything fails.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, http, isAddress } from "viem";

const ROOT = resolve(import.meta.dirname, "..");
const file = process.env.ENV_FILE ?? [".env.production", ".env.local"].find((f) => existsSync(resolve(ROOT, f)));
const env = { ...process.env };
if (file) {
  for (const line of readFileSync(resolve(ROOT, file), "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#")) env[m[1]] ??= m[2].replace(/^"|"$/g, "");
  }
}
const get = (k) => (env[k] ?? "").trim();
const chainId = Number(get("ONLYCHAIN_CHAIN_ID") || get("NEXT_PUBLIC_ONLYCHAIN_CHAIN_ID") || 4663);
const rpc = get("ONLYCHAIN_RPC_URL") || get("NEXT_PUBLIC_ONLYCHAIN_RPC_URL") || (chainId === 31337 ? "http://127.0.0.1:8766" : "https://rpc.mainnet.chain.robinhood.com");
const token = get("ONLYCHAIN_TOKEN") || get("NEXT_PUBLIC_ONLYCHAIN_TOKEN");
const hub = get("ONLYCHAIN_HUB") || get("NEXT_PUBLIC_ONLYCHAIN_HUB");
const curve = get("NEXT_PUBLIC_ONLYCHAIN_CURVE");

const { onlyChainAbi, erc20Abi, curveAbi } = await import("../src/lib/abi/onlychain.ts");
const { site } = await import("../src/lib/site.ts");

let failed = 0;
const ok = (msg) => console.log(`  ✔ ${msg}`);
const bad = (msg) => {
  failed++;
  console.log(`  ✘ ${msg}`);
};

console.log(`ONLYCHAIN — go-live preflight${file ? ` (${file})` : ""}`);
console.log(`  chain ${chainId} · ${rpc}`);
const client = createPublicClient({ transport: http(rpc, { timeout: 15_000 }) });

try {
  const id = await client.getChainId();
  if (id === chainId) ok(`RPC answers, chain id ${id}`);
  else bad(`RPC is chain ${id}, env says ${chainId}`);
} catch (err) {
  bad(`RPC does not answer: ${err.message}`);
}

if (!isAddress(token)) bad("NEXT_PUBLIC_ONLYCHAIN_TOKEN is not set to an address");
else {
  const code = await client.getCode({ address: token }).catch(() => "0x");
  if (!code || code === "0x") bad(`no contract at token ${token}`);
  else {
    try {
      const [name, symbol, decimals, supply] = await Promise.all(["name", "symbol", "decimals", "totalSupply"].map((fn) => client.readContract({ address: token, abi: erc20Abi, functionName: fn })));
      ok(`token ${token}: ${name} (${symbol}), ${decimals} decimals, supply ${(Number(supply) / 10 ** Number(decimals)).toLocaleString("en-US")}`);
      if (Number(decimals) !== site.token.decimals) bad(`token has ${decimals} decimals, site.ts says ${site.token.decimals}`);
      if (symbol !== site.token.symbol) console.log(`  · symbol on chain is ${symbol}, site.ts says ${site.token.symbol} (copy only)`);
    } catch (err) {
      bad(`token does not behave like an ERC-20: ${err.shortMessage ?? err.message}`);
    }
  }
}

if (!isAddress(hub)) bad("NEXT_PUBLIC_ONLYCHAIN_HUB is not set to an address — deploy it on /setup");
else {
  const code = await client.getCode({ address: hub }).catch(() => "0x");
  if (!code || code === "0x") bad(`no contract at hub ${hub}`);
  else {
    try {
      const [hubToken, feeBps, feeRecipient] = await Promise.all(["token", "feeBps", "feeRecipient"].map((fn) => client.readContract({ address: hub, abi: onlyChainAbi, functionName: fn })));
      const burns = ["0x000000000000000000000000000000000000dead", "0x0000000000000000000000000000000000000000"].includes(String(feeRecipient).toLowerCase());
      ok(`hub ${hub}: fee ${Number(feeBps) / 100}% → ${burns ? "burn" : feeRecipient}`);
      if (isAddress(token) && String(hubToken).toLowerCase() !== token.toLowerCase()) bad(`hub pays in ${hubToken}, not the configured token`);
      else ok("hub token matches NEXT_PUBLIC_ONLYCHAIN_TOKEN");
      if (Number(feeBps) !== site.feeBps) bad(`hub fee is ${Number(feeBps) / 100}%, site.ts says ${site.feeBps / 100}% — align the copy`);
    } catch (err) {
      bad(`hub does not answer like OnlyChain: ${err.shortMessage ?? err.message}`);
    }
  }
}

if (!curve) console.log("  · NEXT_PUBLIC_ONLYCHAIN_CURVE not set: the Buy button links to NEXT_PUBLIC_ONLYCHAIN_BUY_URL" + (get("NEXT_PUBLIC_ONLYCHAIN_BUY_URL") ? "" : " — which is also empty"));
else if (!isAddress(curve)) bad("NEXT_PUBLIC_ONLYCHAIN_CURVE is not an address");
else {
  try {
    const [r, graduated] = await Promise.all([client.readContract({ address: curve, abi: curveAbi, functionName: "getReserves" }), client.readContract({ address: curve, abi: curveAbi, functionName: "graduated" }).catch(() => null)]);
    ok(`curve ${curve}: reserves ${Number(r[0]) / 1e18} quote / ${(Number(r[1]) / 1e18).toLocaleString("en-US")} tokens${graduated ? " — GRADUATED, buyers go to the market URL" : ""}`);
  } catch (err) {
    bad(`curve does not answer getReserves: ${err.shortMessage ?? err.message}`);
  }
}

if (!get("SESSION_SECRET") || get("SESSION_SECRET").length < 16) bad("SESSION_SECRET missing or shorter than 16 chars (sessions would not survive a restart)");
else ok("SESSION_SECRET set");
if (!get("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID")) console.log("  · NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID not set: mobile wallets by QR are off (browser wallets work)");

console.log(failed ? `\n${failed} problem(s) — not ready.` : "\nReady: the site pays in this coin.");
process.exit(failed ? 1 : 0);
