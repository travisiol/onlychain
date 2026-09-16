"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { useConnection, usePublicClient, useWalletClient } from "wagmi";
import { Icon } from "@/components/Icon";
import { useSession } from "@/components/session";
import { ColumnHeader } from "@/components/shell/AppShell";
import { curveAbi, erc20Abi, onlyChainAbi } from "@/lib/abi/onlychain";
import hubArtifact from "@/lib/abi/OnlyChain.bytecode.json";
import { chain, CURVE_ADDRESS, TOKEN_ADDRESS } from "@/lib/chain";
import { api } from "@/lib/client/api";
import { explainError } from "@/lib/client/pay";
import { site } from "@/lib/site";

/**
 * The day the coin has a contract address: paste it here, the page reads
 * it live (symbol, decimals, supply), then deploys the OnlyChain hub against
 * it from the connected wallet and prints the three environment lines to
 * set. Also checks what the site is currently pointed at. Anyone can open
 * this page — deploying a hub costs gas and changes nothing until the env
 * points at it.
 */

const BURN = "0x000000000000000000000000000000000000dEaD";

type Health = { chain: { id: number; hub: string | null; token: string | null; configured: boolean; reachable: boolean; block: number | null }; hub: { hub: string; token: string; feeBps: number; feeRecipient: string; burns: boolean; tokenSymbol: string; tokenName: string; decimals: number } | null };

export function Setup() {
  const { session, signIn } = useSession();
  const { address, chainId } = useConnection();
  const client = usePublicClient();
  const { data: wallet } = useWalletClient();
  const [tokenIn, setTokenIn] = useState(TOKEN_ADDRESS ?? "");
  const [curveIn, setCurveIn] = useState(CURVE_ADDRESS ?? "");
  const [recipient, setRecipient] = useState<"me" | "burn" | "other">("me");
  const [other, setOther] = useState("");
  const [fee, setFee] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployed, setDeployed] = useState<{ hub: Address; tx: Hex } | null>(null);

  const health = useQuery({ queryKey: ["health"], queryFn: () => api<Health>("/api/health"), refetchInterval: 20_000 });

  const tokenAddr = isAddress(tokenIn.trim()) ? getAddress(tokenIn.trim()) : null;
  const curveAddr = isAddress(curveIn.trim()) ? getAddress(curveIn.trim()) : null;
  const token = useQuery({
    queryKey: ["setup-token", tokenAddr],
    enabled: Boolean(tokenAddr && client),
    queryFn: async () => {
      const code = await client!.getCode({ address: tokenAddr! });
      if (!code || code === "0x") throw new Error("No contract at this address on this chain.");
      const [name, symbol, decimals, supply] = await Promise.all([
        client!.readContract({ address: tokenAddr!, abi: erc20Abi, functionName: "name" }),
        client!.readContract({ address: tokenAddr!, abi: erc20Abi, functionName: "symbol" }),
        client!.readContract({ address: tokenAddr!, abi: erc20Abi, functionName: "decimals" }),
        client!.readContract({ address: tokenAddr!, abi: erc20Abi, functionName: "totalSupply" }),
      ]);
      return { name, symbol, decimals: Number(decimals), supply: supply.toString() };
    },
  });
  const curve = useQuery({
    queryKey: ["setup-curve", curveAddr],
    enabled: Boolean(curveAddr && client),
    queryFn: async () => {
      const [reserves, graduated] = await Promise.all([client!.readContract({ address: curveAddr!, abi: curveAbi, functionName: "getReserves" }), client!.readContract({ address: curveAddr!, abi: curveAbi, functionName: "graduated" }).catch(() => null)]);
      return { quote: reserves[0].toString(), tokens: reserves[1].toString(), graduated };
    },
  });

  const feeBps = /^\d{1,2}(\.\d)?$/.test(fee) ? Math.round(Number(fee) * 100) : NaN;
  const feeRecipient = recipient === "burn" ? BURN : recipient === "me" ? (address ?? null) : isAddress(other.trim()) ? getAddress(other.trim()) : null;
  const wrongChain = chainId !== undefined && chainId !== chain.id;
  const canDeploy = Boolean(wallet && tokenAddr && token.data && feeRecipient && Number.isFinite(feeBps) && feeBps <= 2000 && !wrongChain && !busy);

  const deploy = async () => {
    if (!wallet || !client || !tokenAddr || !feeRecipient) return;
    setBusy(true);
    setError(null);
    try {
      const hash = await wallet.deployContract({ abi: onlyChainAbi, bytecode: hubArtifact.bytecode as Hex, args: [tokenAddr, feeRecipient, feeBps], chain });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success" || !receipt.contractAddress) throw new Error("The deployment reverted.");
      const check = await client.readContract({ address: receipt.contractAddress, abi: onlyChainAbi, functionName: "token" });
      if (check.toLowerCase() !== tokenAddr.toLowerCase()) throw new Error("Deployed, but the hub's token does not match — do not use it.");
      setDeployed({ hub: receipt.contractAddress, tx: hash });
    } catch (err) {
      setError(explainError(err));
    } finally {
      setBusy(false);
    }
  };

  const envLines = [
    `NEXT_PUBLIC_ONLYCHAIN_CHAIN_ID=${chain.id}`,
    `NEXT_PUBLIC_ONLYCHAIN_TOKEN=${tokenAddr ?? "0x…"}`,
    `NEXT_PUBLIC_ONLYCHAIN_HUB=${deployed?.hub ?? "0x…(deploy above)"}`,
    `NEXT_PUBLIC_ONLYCHAIN_CURVE=${curveAddr ?? ""}`,
  ].join("\n");

  const h = health.data;
  return (
    <>
      <ColumnHeader title="Set up the coin" sub={`Point ${site.name} at the real $${site.token.symbol}`} />
      <div className="mx-auto max-w-[760px] space-y-4 p-4">
        <section className="card p-5">
          <h2 className="text-[16px] font-bold">What the site uses right now</h2>
          {health.isPending && <p className="mt-2 text-[13px] text-ink-2">Reading…</p>}
          {h && (
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-[160px_1fr]">
              <dt className="text-ink-2">Chain</dt>
              <dd className="mono">
                {h.chain.id} · {h.chain.reachable ? `block ${h.chain.block}` : <span className="text-danger">RPC not answering</span>}
              </dd>
              <dt className="text-ink-2">Token</dt>
              <dd className="mono break-all">{h.chain.token ?? <span className="text-danger">not set</span>}</dd>
              <dt className="text-ink-2">Hub</dt>
              <dd className="mono break-all">{h.chain.hub ?? <span className="text-danger">not set</span>}</dd>
              <dt className="text-ink-2">Hub says</dt>
              <dd>
                {h.hub ? (
                  <span className={h.hub.token.toLowerCase() === (h.chain.token ?? "").toLowerCase() ? "text-success" : "text-danger"}>
                    pays in {h.hub.tokenName} ({h.hub.tokenSymbol}), {h.hub.decimals} decimals · fee {h.hub.feeBps / 100}% → {h.hub.burns ? "burn" : h.hub.feeRecipient}
                    {h.hub.token.toLowerCase() !== (h.chain.token ?? "").toLowerCase() ? " — does NOT match the token above" : " — matches"}
                  </span>
                ) : (
                  <span className="text-ink-2">unreachable or not deployed</span>
                )}
              </dd>
              <dt className="text-ink-2">Curve (buy)</dt>
              <dd className="mono break-all">{CURVE_ADDRESS ?? <span className="text-ink-2">not set — the Buy button links out</span>}</dd>
            </dl>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-[16px] font-bold">1 · The coin&apos;s contract address</h2>
          <p className="mt-1 text-[13px] text-ink-2">Paste the CA of ${site.token.symbol} on {chain.name}. The page reads it from the chain.</p>
          <input value={tokenIn} onChange={(e) => setTokenIn(e.target.value)} placeholder="0x…" className="field mono mt-3 text-[13px]" spellCheck={false} />
          <div className="mt-2 min-h-[20px] text-[13px]">
            {tokenIn && !tokenAddr && <span className="text-danger">Not an address.</span>}
            {token.isFetching && <span className="text-ink-2">Reading the token…</span>}
            {token.error && <span className="text-danger">{(token.error as Error).message}</span>}
            {token.data && (
              <span className={token.data.decimals === 18 ? "text-success" : "text-gold"}>
                <Icon name="check" size={14} className="mr-1 inline" />
                {token.data.name} ({token.data.symbol}), {token.data.decimals} decimals, supply {(Number(token.data.supply) / 10 ** token.data.decimals).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                {token.data.decimals !== 18 ? " — the site formats amounts with 18 decimals; change site.token.decimals" : ""}
              </span>
            )}
          </div>
          <p className="mt-3 text-[13px] text-ink-2">Optional: the Pons V2 curve the coin trades on, so fans can buy it inside the site.</p>
          <input value={curveIn} onChange={(e) => setCurveIn(e.target.value)} placeholder="0x… (bonding curve)" className="field mono mt-2 text-[13px]" spellCheck={false} />
          <div className="mt-2 min-h-[20px] text-[13px]">
            {curveIn && !curveAddr && <span className="text-danger">Not an address.</span>}
            {curve.error && <span className="text-danger">This address does not answer getReserves(): not a curve.</span>}
            {curve.data && (
              <span className="text-success">
                <Icon name="check" size={14} className="mr-1 inline" /> Curve answers: {(Number(curve.data.tokens) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 0 })} tokens in reserve{curve.data.graduated ? " — graduated (buyers will be sent to the market URL)" : ""}
              </span>
            )}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-[16px] font-bold">2 · Deploy the hub against it</h2>
          <p className="mt-1 text-[13px] text-ink-2">One transaction from your wallet. The hub is immutable: token, platform address and fee are fixed forever, and it has no owner.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <span className="field-label">Platform share goes to</span>
              <div className="space-y-1.5 text-[14px]">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={recipient === "me"} onChange={() => setRecipient("me")} className="accent-[var(--color-accent)]" /> This wallet {address ? <span className="mono text-[12px] text-ink-2">{address.slice(0, 8)}…</span> : null}
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={recipient === "burn"} onChange={() => setRecipient("burn")} className="accent-[var(--color-accent)]" /> Burn address (every fee destroys ${site.token.symbol})
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={recipient === "other"} onChange={() => setRecipient("other")} className="accent-[var(--color-accent)]" /> Another address
                </label>
                {recipient === "other" && <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="0x…" className="field mono mt-1 text-[13px]" spellCheck={false} />}
              </div>
            </div>
            <label className="block">
              <span className="field-label">Platform fee</span>
              <span className="relative block">
                <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" className="field pr-8" />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-ink-2">%</span>
              </span>
              <span className="mt-1 block text-[12px] text-ink-3">0–20 %. The site shows {site.feeBps / 100}% in its copy (site.ts); keep them equal.</span>
            </label>
          </div>
          {!session && (
            <button type="button" className="btn btn-accent mt-4" onClick={() => signIn()}>
              <Icon name="wallet" size={16} /> Connect the deploying wallet
            </button>
          )}
          {session && wrongChain && <p className="mt-3 text-[13px] text-danger">Your wallet is on chain {chainId}; switch it to {chain.name} ({chain.id}).</p>}
          {session && (
            <button type="button" className="btn btn-accent mt-4" onClick={deploy} disabled={!canDeploy}>
              {busy ? <Icon name="spinner" size={16} className="spin" /> : <Icon name="shield" size={16} />} Deploy OnlyChain hub
            </button>
          )}
          <div className="mt-2 min-h-[20px] text-[13px]">
            {error && <span className="text-danger">{error}</span>}
            {deployed && (
              <span className="text-success">
                <Icon name="check" size={14} className="mr-1 inline" /> Deployed at <span className="mono">{deployed.hub}</span> — token verified.
              </span>
            )}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-[16px] font-bold">3 · Point the site at it</h2>
          <p className="mt-1 text-[13px] text-ink-2">Set these on the host (Vercel → Settings → Environment Variables) and redeploy. The server reads the same values; nothing else changes.</p>
          <pre className="mono mt-3 overflow-x-auto rounded-[8px] bg-bg-2 p-3 text-[12px]">{envLines}</pre>
          <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => navigator.clipboard?.writeText(envLines)}>
            <Icon name="copy" size={14} /> Copy
          </button>
          <p className="mt-3 text-[12px] text-ink-3">
            Then open this page again: the first box must read &ldquo;matches&rdquo;. From the terminal, <code className="mono">npm run go-live</code> runs the same checks against the RPC.
          </p>
        </section>
      </div>
    </>
  );
}
