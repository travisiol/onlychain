"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatEther, getAddress, isAddress, parseEther, type Address } from "viem";
import { useBalance, useConnection, useReadContract } from "wagmi";
import { Icon } from "@/components/Icon";
import { Dialog } from "@/components/pay/Dialog";
import { useSession } from "@/components/session";
import { curveAbi, erc20Abi } from "@/lib/abi/onlychain";
import { chain, CURVE_ADDRESS, explorerTx, TOKEN_ADDRESS } from "@/lib/chain";
import { STEP_LABEL, usePay } from "@/lib/client/pay";
import { normalizeReserves, quoteSell, withSlippage } from "@/lib/curve";
import { fmtOnly, parseOnly } from "@/lib/format";
import { site } from "@/lib/site";

/**
 * Taking money out. There is nothing to withdraw from the site — the coin
 * is already in the wallet — so "withdraw" here means: sell $ONLY for ETH
 * on the curve, and send ETH (or $ONLY) to another address, typically an
 * exchange deposit address on the way to a bank account.
 */

const BRIDGE_URL = process.env.NEXT_PUBLIC_ONLYCHAIN_BRIDGE_URL?.trim() || "";

function Progress({ step, error, txHash, doneLabel }: { step: string; error: string | null; txHash: `0x${string}` | null; doneLabel: string }) {
  const link = txHash ? explorerTx(txHash) : null;
  return (
    <div className="mt-3 min-h-[20px] text-[13px]">
      {error && <p className="text-danger">{error}</p>}
      {!error && step !== "idle" && step !== "done" && (
        <p className="flex items-center gap-2 text-ink-2">
          <Icon name="spinner" size={16} className="spin" /> {STEP_LABEL[step as keyof typeof STEP_LABEL]}
        </p>
      )}
      {step === "done" && txHash && (
        <p className="flex items-center gap-2 text-success">
          <Icon name="check" size={16} /> {doneLabel}
          {link ? (
            <a href={link} target="_blank" rel="noreferrer" className="text-accent hover:underline">
              view transaction
            </a>
          ) : (
            <span className="mono text-ink-3">{txHash.slice(0, 10)}…</span>
          )}
        </p>
      )}
    </div>
  );
}

export function SellDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: () => void }) {
  const { session } = useSession();
  const { address } = useConnection();
  const { pay, step, error, txHash, busy, reset } = usePay();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [received, setReceived] = useState<bigint | null>(null);
  const me = address ?? session?.address;
  const canSell = Boolean(CURVE_ADDRESS && TOKEN_ADDRESS);

  const balance = useReadContract({ address: TOKEN_ADDRESS ?? undefined, abi: erc20Abi, functionName: "balanceOf", args: me ? [me] : undefined, query: { enabled: open && Boolean(me && TOKEN_ADDRESS) } });
  const reserves = useReadContract({ address: CURVE_ADDRESS ?? undefined, abi: curveAbi, functionName: "getReserves", query: { enabled: open && canSell, refetchInterval: 10_000 } });
  const held = useReadContract({ address: CURVE_ADDRESS ?? undefined, abi: curveAbi, functionName: "realQuoteReserve", query: { enabled: open && canSell, refetchInterval: 10_000 } });
  const fee = useReadContract({ address: CURVE_ADDRESS ?? undefined, abi: curveAbi, functionName: "feeBps", query: { enabled: open && canSell } });
  const graduated = useReadContract({ address: CURVE_ADDRESS ?? undefined, abi: curveAbi, functionName: "graduated", query: { enabled: open && canSell } });
  const ethBalance = useBalance({ address: me, query: { enabled: open && Boolean(me) } });

  const r = reserves.data ? normalizeReserves(reserves.data[0], reserves.data[1]) : null;
  const feeBps = fee.data !== undefined ? Number(fee.data) : 100;
  const wei = parseOnly(amount);
  const tooMuch = wei !== null && balance.data !== undefined && wei > balance.data;
  const quote = r && wei && wei > 0n ? quoteSell(r, feeBps, wei) : null;
  const beyondHeld = quote !== null && held.data !== undefined && quote.quoteOut > held.data;
  const external = !canSell || graduated.data === true;

  const close = () => {
    reset();
    setReceived(null);
    onClose();
  };
  const submit = async () => {
    if (!wei || !quote) return;
    const before = ethBalance.data?.value ?? 0n;
    const hash = await pay({ kind: "sell", tokens: wei, minEthOut: withSlippage(quote.quoteOut, 100) });
    if (hash) {
      const after = await ethBalance.refetch();
      setReceived((after.data?.value ?? before) - before);
      await qc.invalidateQueries();
      onDone?.();
    }
  };

  return (
    <Dialog open={open} onClose={close} title={`Sell $${site.token.symbol} for ETH`}>
      {external ? (
        <div>
          <p className="text-[14px] text-ink-2">{!canSell ? "Selling inside the site is not configured on this deployment." : `$${site.token.symbol} has graduated from its launch curve and now trades on a DEX.`}</p>
          {site.buyUrl && (
            <a href={site.buyUrl} target="_blank" rel="noreferrer" className="btn btn-accent btn-block mt-4">
              Open the market <Icon name="external" size={14} />
            </a>
          )}
        </div>
      ) : (
        <>
          <p className="text-[13px] text-ink-2">Sold on the launch curve, ETH straight to your wallet. Quoted from the curve&apos;s reserves; the transaction reverts rather than fill below 1 % of the quote.</p>
          <div className="relative mt-4">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" className="field pr-16 text-[16px]" aria-label={`${site.token.symbol} to sell`} />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-2">{site.token.symbol}</span>
          </div>
          <div className="mt-2 flex gap-2 text-[12px]">
            {[25, 50, 100].map((pct) => (
              <button key={pct} type="button" className="rounded-full border border-line-2 px-2.5 py-1 text-ink-2 hover:bg-bg-2" onClick={() => balance.data !== undefined && setAmount(fmtOnly((balance.data * BigInt(pct)) / 100n, { symbol: false, maxDecimals: 6 }).replace(/,/g, ""))}>
                {pct === 100 ? "All" : `${pct}%`}
              </button>
            ))}
          </div>
          <dl className="mt-4 space-y-1.5 rounded-[8px] bg-bg-2 px-4 py-3 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-ink-2">You have</dt>
              <dd className={`font-medium ${tooMuch ? "text-danger" : ""}`}>{balance.data !== undefined ? fmtOnly(balance.data) : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-2">You receive (about)</dt>
              <dd className="font-semibold">{quote ? `${Number(formatEther(quote.quoteOut)).toFixed(6)} ETH` : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-2">Curve fee ({feeBps / 100}%)</dt>
              <dd className="font-medium">{quote ? `${Number(formatEther(quote.fee)).toFixed(6)} ETH` : "—"}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-1.5">
              <dt className="text-ink-2">ETH the curve holds</dt>
              <dd className={`font-medium ${beyondHeld ? "text-danger" : ""}`}>{held.data !== undefined ? `${Number(formatEther(held.data)).toFixed(4)} ETH` : "—"}</dd>
            </div>
          </dl>
          <Progress step={step} error={error} txHash={txHash} doneLabel={`Sold — ${received !== null ? `${Number(formatEther(received)).toFixed(6)} ETH received` : ""}`} />
          {step === "done" ? (
            <button type="button" className="btn btn-accent btn-block mt-3" onClick={close}>
              Done
            </button>
          ) : (
            <button type="button" className="btn btn-accent btn-block mt-3" onClick={submit} disabled={busy || !wei || wei === 0n || !quote || tooMuch || beyondHeld}>
              {busy ? <Icon name="spinner" size={16} className="spin" /> : <Icon name="coin" size={16} />}
              {tooMuch ? "More than you have" : beyondHeld ? "Sell less — the curve holds less ETH" : `Sell ${wei ? fmtOnly(wei) : ""}`}
            </button>
          )}
        </>
      )}
    </Dialog>
  );
}

export function SendDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone?: () => void }) {
  const { session } = useSession();
  const { address } = useConnection();
  const { pay, step, error, txHash, busy, reset } = usePay();
  const qc = useQueryClient();
  const [asset, setAsset] = useState<"eth" | "only">("eth");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const me = address ?? session?.address;
  const only = useReadContract({ address: TOKEN_ADDRESS ?? undefined, abi: erc20Abi, functionName: "balanceOf", args: me ? [me] : undefined, query: { enabled: open && Boolean(me && TOKEN_ADDRESS) } });
  const eth = useBalance({ address: me, query: { enabled: open && Boolean(me) } });

  const toAddr = isAddress(to.trim()) ? (getAddress(to.trim()) as Address) : null;
  let wei: bigint | null = null;
  if (asset === "only") wei = parseOnly(amount);
  else {
    try {
      wei = /^\d*\.?\d*$/.test(amount.trim()) && amount.trim() !== "" && amount.trim() !== "." ? parseEther(amount.trim()) : null;
    } catch {
      wei = null;
    }
  }
  const have = asset === "only" ? only.data : eth.data?.value;
  const tooMuch = wei !== null && have !== undefined && wei > have;
  const selfSend = toAddr !== null && me !== undefined && toAddr.toLowerCase() === me.toLowerCase();

  const close = () => {
    reset();
    onClose();
  };
  const submit = async () => {
    if (!wei || !toAddr) return;
    const hash = await pay({ kind: "send", asset, to: toAddr, amount: wei });
    if (hash) {
      await qc.invalidateQueries();
      onDone?.();
    }
  };

  return (
    <Dialog open={open} onClose={close} title="Send to another wallet">
      <p className="text-[13px] text-ink-2">
        To cash out to a bank, send ETH to the deposit address an exchange gives you for <b>{chain.name}</b> — check on the exchange that it accepts this network first, or bridge the ETH out{BRIDGE_URL ? "" : " through the chain's official bridge"} and sell it there. A transfer on the chain is final.
      </p>
      {BRIDGE_URL && (
        <a href={BRIDGE_URL} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
          Bridge out of {chain.name} <Icon name="external" size={13} />
        </a>
      )}
      <div className="mt-4 flex overflow-hidden rounded-full border border-line-2 text-[12px] font-semibold uppercase tracking-[0.04em]">
        {(["eth", "only"] as const).map((a) => (
          <button key={a} type="button" onClick={() => setAsset(a)} className={`flex-1 px-3 py-1.5 transition-colors ${asset === a ? "bg-accent text-white" : "text-ink-2 hover:bg-bg-2"}`}>
            {a === "eth" ? "ETH" : `$${site.token.symbol}`}
          </button>
        ))}
      </div>
      <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Recipient address 0x…" className="field mono mt-3 text-[13px]" spellCheck={false} aria-label="Recipient" />
      <div className="relative mt-2">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" className="field pr-16 text-[16px]" aria-label="Amount" />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-2">{asset === "eth" ? "ETH" : site.token.symbol}</span>
      </div>
      <p className="mt-2 text-[12px] text-ink-2">
        You have {have === undefined ? "—" : asset === "only" ? fmtOnly(have) : `${Number(formatEther(have)).toFixed(4)} ETH`}
        {asset === "eth" ? " — keep a little for gas." : ""}
      </p>
      <Progress step={step} error={error} txHash={txHash} doneLabel="Sent." />
      {step === "done" ? (
        <button type="button" className="btn btn-accent btn-block mt-3" onClick={close}>
          Done
        </button>
      ) : (
        <button type="button" className="btn btn-accent btn-block mt-3" onClick={submit} disabled={busy || !wei || wei === 0n || !toAddr || tooMuch || selfSend}>
          {busy ? <Icon name="spinner" size={16} className="spin" /> : <Icon name="send" size={16} />}
          {to && !toAddr ? "Not an address" : selfSend ? "That is your own wallet" : tooMuch ? "More than you have" : `Send ${wei ? (asset === "only" ? fmtOnly(wei) : `${amount} ETH`) : ""}`}
        </button>
      )}
    </Dialog>
  );
}

/** The Wallet page's cash-out block: the two dialogs and the honest explanation. */
export function CashOut({ onChange }: { onChange?: () => void }) {
  const [open, setOpen] = useState<null | "sell" | "send">(null);
  return (
    <section id="cashout" className="card p-5">
      <h2 className="eyebrow">Withdraw</h2>
      <p className="mt-1 text-[14px] text-ink-2">
        There is nothing to withdraw from {site.name}: what fans pay is already in this wallet, the second they pay. To turn it into money you can spend, <b className="text-ink">sell ${site.token.symbol} for ETH</b> here, then <b className="text-ink">send the ETH</b> to an exchange and cash out there — or keep it as ${site.token.symbol}.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-accent btn-sm" onClick={() => setOpen("sell")}>
          <Icon name="coin" size={14} /> Sell ${site.token.symbol} for ETH
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen("send")}>
          <Icon name="send" size={14} /> Send to another wallet
        </button>
      </div>
      <SellDialog open={open === "sell"} onClose={() => setOpen(null)} onDone={onChange} />
      <SendDialog open={open === "send"} onClose={() => setOpen(null)} onDone={onChange} />
    </section>
  );
}
