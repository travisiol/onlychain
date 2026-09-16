"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatEther, parseEther } from "viem";
import { useBalance, useConnection, useReadContract } from "wagmi";
import { Icon } from "@/components/Icon";
import { Dialog } from "@/components/pay/Dialog";
import { useSession } from "@/components/session";
import { curveAbi, erc20Abi } from "@/lib/abi/onlychain";
import { chain, CURVE_ADDRESS, explorerTx, TOKEN_ADDRESS } from "@/lib/chain";
import { STEP_LABEL, usePay } from "@/lib/client/pay";
import { normalizeReserves, quoteBuy, quoteFor, withSlippage } from "@/lib/curve";
import { fmtOnly } from "@/lib/format";
import { site } from "@/lib/site";

/**
 * Buy $ONLY with ETH without leaving the site: the bonding curve's `buy`,
 * quoted from its reserves with the same constant-product maths the curve
 * runs, 1 % slippage. When the curve has graduated (or none is configured)
 * the dialog points to the DEX page instead.
 */
const PRESETS = ["0.01", "0.05", "0.1", "0.5"];

export function BuyDialog({ open, onClose, need, onBought }: { open: boolean; onClose: () => void; need?: bigint; onBought?: () => void }) {
  const { session } = useSession();
  const { address } = useConnection();
  const { pay, step, error, txHash, busy, reset, canBuy } = usePay();
  const qc = useQueryClient();
  const [eth, setEth] = useState("0.05");
  const [received, setReceived] = useState<bigint | null>(null);
  const me = address ?? session?.address;

  const reserves = useReadContract({ address: CURVE_ADDRESS ?? undefined, abi: curveAbi, functionName: "getReserves", query: { enabled: open && canBuy, refetchInterval: 10_000 } });
  const fee = useReadContract({ address: CURVE_ADDRESS ?? undefined, abi: curveAbi, functionName: "feeBps", query: { enabled: open && canBuy } });
  const graduated = useReadContract({ address: CURVE_ADDRESS ?? undefined, abi: curveAbi, functionName: "graduated", query: { enabled: open && canBuy } });
  const ethBalance = useBalance({ address: me, query: { enabled: open && Boolean(me), refetchInterval: 10_000 } });
  const onlyBalance = useReadContract({ address: TOKEN_ADDRESS ?? undefined, abi: erc20Abi, functionName: "balanceOf", args: me ? [me] : undefined, query: { enabled: open && Boolean(me) } });

  const r = reserves.data ? normalizeReserves(reserves.data[0], reserves.data[1]) : null;
  const feeBps = fee.data !== undefined ? Number(fee.data) : 100;
  let wei: bigint | null = null;
  try {
    wei = /^\d*\.?\d*$/.test(eth.trim()) && eth.trim() !== "" && eth.trim() !== "." ? parseEther(eth.trim()) : null;
  } catch {
    wei = null;
  }
  const quote = r && wei && wei > 0n ? quoteBuy(r, feeBps, wei) : null;
  const suggested = r && need && need > 0n ? quoteFor(r, feeBps, need) : null;
  const notEnoughEth = wei !== null && ethBalance.data !== undefined && wei > ethBalance.data.value;
  const external = !canBuy || graduated.data === true;

  const close = () => {
    reset();
    setReceived(null);
    onClose();
  };
  const submit = async () => {
    if (!wei || !quote) return;
    const before = onlyBalance.data ?? 0n;
    const hash = await pay({ kind: "buy", eth: wei, minTokensOut: withSlippage(quote.tokensOut, 100) });
    if (hash) {
      const after = await onlyBalance.refetch();
      setReceived((after.data ?? before) - before);
      await qc.invalidateQueries();
      onBought?.();
    }
  };

  return (
    <Dialog open={open} onClose={close} title={`Buy $${site.token.symbol}`}>
      {external ? (
        <div>
          <p className="text-[14px] text-ink-2">
            {!canBuy ? `Buying inside the site is not configured on this deployment.` : `$${site.token.symbol} has graduated from its launch curve and now trades on a DEX.`}
          </p>
          {site.buyUrl ? (
            <a href={site.buyUrl} target="_blank" rel="noreferrer" className="btn btn-accent btn-block mt-4">
              Buy ${site.token.symbol} <Icon name="external" size={14} />
            </a>
          ) : (
            <p className="mt-3 text-[13px] text-ink-3">Set NEXT_PUBLIC_ONLYCHAIN_BUY_URL to point buyers to the market.</p>
          )}
        </div>
      ) : (
        <>
          <p className="text-[13px] text-ink-2">
            Paid in ETH on {chain.name}, straight from the launch curve to your wallet. {need && need > 0n ? `You need ${fmtOnly(need)} more for this.` : ""}
          </p>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => setEth(p)} className={`rounded-[8px] border py-2 text-[13px] font-semibold transition-colors ${eth === p ? "border-accent bg-accent-soft text-accent-ink" : "border-line-2 hover:bg-bg-2"}`}>
                {p} ETH
              </button>
            ))}
          </div>
          <div className="relative mt-3">
            <input value={eth} onChange={(e) => setEth(e.target.value)} inputMode="decimal" className="field pr-14 text-[16px]" aria-label="ETH to spend" />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-2">ETH</span>
          </div>
          {suggested !== null && suggested > 0n && (
            <button type="button" className="mt-2 text-[12px] font-medium text-accent hover:underline" onClick={() => setEth(Number(formatEther((suggested * 102n) / 100n)).toFixed(6))}>
              Just enough for this: {Number(formatEther((suggested * 102n) / 100n)).toFixed(6)} ETH
            </button>
          )}
          <dl className="mt-4 space-y-1.5 rounded-[8px] bg-bg-2 px-4 py-3 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-ink-2">You receive (about)</dt>
              <dd className="font-semibold">{quote ? fmtOnly(quote.tokensOut) : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-2">Curve fee ({feeBps / 100}%)</dt>
              <dd className="font-medium">{quote ? `${Number(formatEther(quote.fee)).toFixed(6)} ETH` : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-2">Your ETH</dt>
              <dd className={`font-medium ${notEnoughEth ? "text-danger" : ""}`}>{ethBalance.data ? `${Number(formatEther(ethBalance.data.value)).toFixed(4)} ETH` : "—"}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-1.5">
              <dt className="text-ink-2">Your ${site.token.symbol} now</dt>
              <dd className="font-medium">{onlyBalance.data !== undefined ? fmtOnly(onlyBalance.data) : "—"}</dd>
            </div>
          </dl>
          <div className="mt-3 min-h-[20px] text-[13px]">
            {error && <p className="text-danger">{error}</p>}
            {!error && busy && (
              <p className="flex items-center gap-2 text-ink-2">
                <Icon name="spinner" size={16} className="spin" /> {STEP_LABEL[step]}
              </p>
            )}
            {step === "done" && txHash && (
              <p className="flex items-center gap-2 text-success">
                <Icon name="check" size={16} /> Bought {received !== null ? fmtOnly(received) : ""}
                {explorerTx(txHash) ? (
                  <a href={explorerTx(txHash)!} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    view transaction
                  </a>
                ) : (
                  <span className="mono text-ink-3">{txHash.slice(0, 10)}…</span>
                )}
              </p>
            )}
          </div>
          {step === "done" ? (
            <button type="button" className="btn btn-accent btn-block mt-3" onClick={close}>
              Done
            </button>
          ) : (
            <button type="button" className="btn btn-accent btn-block mt-3" onClick={submit} disabled={busy || !wei || wei === 0n || !quote || notEnoughEth}>
              {busy ? <Icon name="spinner" size={16} className="spin" /> : <Icon name="coin" size={16} />}
              {notEnoughEth ? "Not enough ETH" : `Buy for ${eth || "0"} ETH`}
            </button>
          )}
          <p className="mt-3 text-[12px] text-ink-3">Quoted from the curve&apos;s reserves; the transaction reverts rather than fill below 1 % of the quote.</p>
        </>
      )}
    </Dialog>
  );
}
