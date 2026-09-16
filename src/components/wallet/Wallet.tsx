"use client";

import Link from "next/link";
import { useState } from "react";
import { maxUint256 } from "viem";
import { useReadContract } from "wagmi";
import { Icon } from "@/components/Icon";
import { BuyDialog } from "@/components/pay/BuyDialog";
import { CashOut } from "@/components/pay/CashOut";
import { Usd } from "@/components/Usd";
import { useSession } from "@/components/session";
import { ColumnHeader, SignInDoor } from "@/components/shell/AppShell";
import { erc20Abi, onlyChainAbi } from "@/lib/abi/onlychain";
import { chain, CURVE_ADDRESS, explorerAddress, HUB_ADDRESS, TOKEN_ADDRESS } from "@/lib/chain";
import { STEP_LABEL, usePay } from "@/lib/client/pay";
import { fmtOnly, parseOnly, shortAddress } from "@/lib/format";
import { site } from "@/lib/site";

/**
 * The reference's "Add card" screen, wallet-native: your $ONLY balance,
 * the hub's spending allowance (approve once, or per payment), what you
 * have spent and earned through the hub, and where the contracts live.
 */
export function Wallet() {
  const { session } = useSession();
  const { pay, step, error, busy, reset } = usePay();
  const [custom, setCustom] = useState("");
  const [buyOpen, setBuyOpen] = useState(false);
  const me = session?.address;
  const ready = Boolean(me && TOKEN_ADDRESS && HUB_ADDRESS);

  const balance = useReadContract({ address: TOKEN_ADDRESS ?? undefined, abi: erc20Abi, functionName: "balanceOf", args: me ? [me] : undefined, query: { enabled: ready, refetchInterval: 12_000 } });
  const allowance = useReadContract({ address: TOKEN_ADDRESS ?? undefined, abi: erc20Abi, functionName: "allowance", args: me && HUB_ADDRESS ? [me, HUB_ADDRESS] : undefined, query: { enabled: ready, refetchInterval: 12_000 } });
  const spent = useReadContract({ address: HUB_ADDRESS ?? undefined, abi: onlyChainAbi, functionName: "spent", args: me ? [me] : undefined, query: { enabled: ready, refetchInterval: 12_000 } });
  const earned = useReadContract({ address: HUB_ADDRESS ?? undefined, abi: onlyChainAbi, functionName: "earned", args: me ? [me] : undefined, query: { enabled: ready, refetchInterval: 12_000 } });

  if (!session) {
    return (
      <>
        <ColumnHeader title="Wallet" />
        <SignInDoor what="your wallet" />
      </>
    );
  }

  const approve = async (amount: bigint) => {
    reset();
    const hash = await pay({ kind: "approve", amount });
    if (hash) {
      await allowance.refetch();
    }
  };
  const unlimited = allowance.data !== undefined && allowance.data > maxUint256 / 2n;
  const customWei = parseOnly(custom);

  return (
    <>
      <ColumnHeader title="Wallet" sub={me ? shortAddress(me, 6) : undefined} />
      <div className="space-y-4 p-4">
        {!ready && (
          <div className="card flex items-start gap-3 p-4 text-[14px]">
            <Icon name="warn" size={20} className="mt-0.5 shrink-0 text-gold" />
            <p>
              Payments are not configured on this deployment: no hub / token address in <code className="mono text-[12px]">NEXT_PUBLIC_ONLYCHAIN_HUB</code>. Browsing works; paying does not.
            </p>
          </div>
        )}

        <section className="card p-5">
          <h2 className="eyebrow">Balance</h2>
          <p className="mt-1 text-[32px] font-bold tracking-[-0.02em]">
            {balance.data !== undefined ? fmtOnly(balance.data) : "—"} <Usd wei={balance.data ?? null} className="text-[15px] text-ink-2" />
          </p>
          <p className="text-[13px] text-ink-2">
            on {chain.name}
            {chain.id === 31337 ? " (local node — every default account was minted 100 000 ONLY by the seed)" : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-accent btn-sm" onClick={() => setBuyOpen(true)}>
              <Icon name="coin" size={14} /> Buy ${site.token.symbol} with ETH
            </button>
            {site.buyUrl && (
              <a href={site.buyUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                Market <Icon name="external" size={14} />
              </a>
            )}
          </div>
          <BuyDialog open={buyOpen} onClose={() => setBuyOpen(false)} onBought={() => balance.refetch()} />
        </section>

        <CashOut onChange={() => balance.refetch()} />

        <section className="card p-5">
          <h2 className="eyebrow">Spending allowance</h2>
          <p className="mt-1 text-[14px] text-ink-2">
            The hub can only move ${site.token.symbol} you have approved — this is the &ldquo;card on file&rdquo;. Approve a large amount once and every payment is a single confirmation; approve nothing and each payment asks twice (approve, then pay). The hub itself never holds a balance.
          </p>
          <p className="mt-3 text-[20px] font-semibold">{allowance.data === undefined ? "—" : unlimited ? "Unlimited" : fmtOnly(allowance.data)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-accent btn-sm" onClick={() => approve(maxUint256)} disabled={busy || !ready || unlimited}>
              Approve unlimited
            </button>
            <div className="relative">
              <input value={custom} onChange={(e) => setCustom(e.target.value)} inputMode="decimal" placeholder="Amount" className="field h-8 w-[150px] rounded-full pr-14 text-[13px]" aria-label="Custom allowance" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-ink-2">{site.token.symbol}</span>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => customWei && approve(customWei)} disabled={busy || !ready || !customWei}>
              Set
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => approve(0n)} disabled={busy || !ready || allowance.data === 0n}>
              Revoke
            </button>
          </div>
          <div className="mt-2 min-h-[18px] text-[13px]">
            {busy && (
              <span className="flex items-center gap-2 text-ink-2">
                <Icon name="spinner" size={14} className="spin" /> {STEP_LABEL[step]}
              </span>
            )}
            {error && <span className="text-danger">{error}</span>}
            {step === "done" && !error && <span className="text-success">Allowance updated.</span>}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4">
          <div className="card p-5">
            <h2 className="eyebrow">Spent</h2>
            <p className="mt-1 text-[22px] font-semibold tracking-[-0.02em]">
              {spent.data !== undefined ? fmtOnly(spent.data) : "—"} <Usd wei={spent.data ?? null} />
            </p>
            <p className="text-[12px] text-ink-3">through the hub, all-time</p>
          </div>
          <div className="card p-5">
            <h2 className="eyebrow">Earned</h2>
            <p className="mt-1 text-[22px] font-semibold tracking-[-0.02em]">
              {earned.data !== undefined ? fmtOnly(earned.data) : "—"} <Usd wei={earned.data ?? null} />
            </p>
            <p className="text-[12px] text-ink-3">net, after the {site.feeBps / 100}% share</p>
          </div>
        </section>

        <section className="card p-5 text-[13px]">
          <h2 className="eyebrow">Contracts</h2>
          <dl className="mt-2 space-y-1.5">
            <Row label={`$${site.token.symbol} token`} address={TOKEN_ADDRESS} />
            <Row label="OnlyChain hub" address={HUB_ADDRESS} />
            <Row label="Launch curve (buy)" address={CURVE_ADDRESS} />
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Go live</dt>
              <dd>
                <Link href="/setup" className="text-accent hover:underline">
                  /setup — verify the coin, deploy the hub
                </Link>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Chain</dt>
              <dd className="mono">
                {chain.name} · {chain.id}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  );
}

function Row({ label, address }: { label: string; address: `0x${string}` | null }) {
  const link = address ? explorerAddress(address) : null;
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-2">{label}</dt>
      <dd className="mono truncate">
        {address ? link ? (
          <a href={link} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            {address}
          </a>
        ) : (
          address
        ) : "not configured"}
      </dd>
    </div>
  );
}
