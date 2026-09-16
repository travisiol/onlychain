"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useReadContract } from "wagmi";
import { erc20Abi } from "@/lib/abi/onlychain";
import { TOKEN_ADDRESS } from "@/lib/chain";
import { BuyDialog } from "@/components/pay/BuyDialog";
import { api } from "@/lib/client/api";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Dialog } from "@/components/pay/Dialog";
import { Usd } from "@/components/Usd";
import { useSession } from "@/components/session";
import { explorerTx } from "@/lib/chain";
import { useNow } from "@/lib/client/now";
import { STEP_LABEL, usePay } from "@/lib/client/pay";
import { displayName, fmtOnly, handleOf, parseOnly } from "@/lib/format";
import { discountFor, quoteMonths } from "@/lib/plan";
import { site } from "@/lib/site";
import type { Plan, ProfileSummary } from "@/lib/model";

/**
 * The three ways to pay a creator, each a small dialog: subscribe (pick the
 * months, see the split), tip (pick an amount), unlock (one fixed price).
 * They share the pay hook and the same "approve, then pay" walk-through.
 */

function Split({ gross }: { gross: bigint }) {
  const fee = (gross * BigInt(site.feeBps)) / 10_000n;
  return (
    <dl className="mt-4 space-y-1.5 rounded-[8px] bg-bg-2 px-4 py-3 text-[13px]">
      <div className="flex justify-between">
        <dt className="text-ink-2">To the creator</dt>
        <dd className="font-medium">{fmtOnly(gross - fee)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-ink-2">{site.name} ({site.feeBps / 100}%)</dt>
        <dd className="font-medium">{fmtOnly(fee)}</dd>
      </div>
      <div className="flex justify-between border-t border-line pt-1.5">
        <dt className="text-ink-2">You pay</dt>
        <dd className="font-semibold">
          {fmtOnly(gross)} <Usd wei={gross} />
        </dd>
      </div>
    </dl>
  );
}

/** "You have X, this costs Y" — and the way to close the gap without leaving the dialog. */
function NeedOnly({ need }: { need: bigint }) {
  const { session } = useSession();
  const [buyOpen, setBuyOpen] = useState(false);
  const balance = useReadContract({ address: TOKEN_ADDRESS ?? undefined, abi: erc20Abi, functionName: "balanceOf", args: session ? [session.address] : undefined, query: { enabled: Boolean(session && TOKEN_ADDRESS), refetchInterval: 10_000 } });
  if (balance.data === undefined || need === 0n) return null;
  const short = balance.data < need;
  return (
    <div className={`mt-3 flex items-center justify-between gap-3 rounded-[8px] px-3 py-2 text-[13px] ${short ? "bg-accent-soft text-accent-ink" : "text-ink-2"}`}>
      <span>
        You have <b>{fmtOnly(balance.data)}</b>
        {short ? ` — ${fmtOnly(need - balance.data)} short` : ""}
      </span>
      {short && (
        <button type="button" className="btn btn-accent btn-sm" onClick={() => setBuyOpen(true)}>
          Buy ${site.token.symbol}
        </button>
      )}
      <BuyDialog open={buyOpen} onClose={() => setBuyOpen(false)} need={need - balance.data} onBought={() => balance.refetch()} />
    </div>
  );
}

function Progress({ step, error, txHash }: { step: string; error: string | null; txHash: Hex | null }) {
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
          <Icon name="check" size={16} /> Paid onchain
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

function Unlimited({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mt-3 flex items-start gap-2 text-[12px] text-ink-2">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-[var(--color-accent)]" />
      <span>
        Let the hub spend ${site.token.symbol} without asking again (one approval now, one confirmation per payment after). Uncheck to approve only this amount. Change it any time on{" "}
        <Link href="/wallet" className="text-accent hover:underline">
          Wallet
        </Link>
        .
      </span>
    </label>
  );
}

const SignInFirst = () => {
  const { signIn, step } = useSession();
  return (
    <div className="py-2">
      <p className="text-[14px] text-ink-2">Sign in with your wallet first — one signature, no gas.</p>
      <button type="button" className="btn btn-accent btn-block mt-4" onClick={() => signIn()} disabled={step !== "idle"}>
        <Icon name="wallet" size={16} /> Connect wallet
      </button>
    </div>
  );
};

export function SubscribeDialog({ open, onClose, creator, plan, currentUntil, trialAvailable = false, onPaid }: { open: boolean; onClose: () => void; creator: ProfileSummary; plan: Plan; currentUntil: number; trialAvailable?: boolean; onPaid?: () => void }) {
  const { session } = useSession();
  const { pay, step, error, txHash, busy, reset, configured } = usePay();
  const qc = useQueryClient();
  const [months, setMonths] = useState(1);
  const [unlimited, setUnlimited] = useState(true);
  const price = plan ? BigInt(plan.monthlyPrice) : 0n;
  const gross = plan ? quoteMonths(plan, months) : 0n;
  const [trialDone, setTrialDone] = useState(false);
  const now = useNow();
  const renewing = now > 0 && currentUntil * 1000 > now;

  const close = () => {
    reset();
    onClose();
  };
  const submit = async () => {
    const hash = await pay({ kind: "subscribe", creator: creator.address as Address, months, cost: gross }, { unlimited });
    if (hash) {
      await qc.invalidateQueries();
      onPaid?.();
    }
  };
  const startTrial = async () => {
    const hash = await pay({ kind: "trial", creator: creator.address as Address });
    if (hash) {
      setTrialDone(true);
      await qc.invalidateQueries();
      onPaid?.();
    }
  };

  return (
    <Dialog open={open} onClose={close} title={renewing ? "Extend subscription" : "Subscribe"}>
      <div className="flex items-center gap-3">
        <Avatar profile={creator} size={48} />
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-[15px] font-semibold">
            {displayName(creator)} {creator.verified && <Icon name="verified" size={16} className="text-accent" />}
          </div>
          <div className="text-[13px] text-ink-2">{handleOf(creator)}</div>
        </div>
      </div>
      {!session ? (
        <SignInFirst />
      ) : !plan?.open ? (
        <p className="mt-4 text-[14px] text-ink-2">This creator is not accepting subscriptions right now.</p>
      ) : (
        <>
          {trialAvailable && plan.trialDays > 0 && !renewing && !trialDone && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-[8px] border border-accent bg-accent-soft px-4 py-3">
              <div className="text-[13px] text-accent-ink">
                <b>{plan.trialDays}-day free trial</b> — no ${site.token.symbol}, gas only. Once per wallet.
              </div>
              <button type="button" className="btn btn-accent btn-sm" onClick={startTrial} disabled={busy || !configured}>
                Start trial
              </button>
            </div>
          )}
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[1, 3, 6, 12].map((m) => {
              const off = discountFor(plan, m);
              return (
                <button key={m} type="button" onClick={() => setMonths(m)} className={`relative rounded-[8px] border px-2 py-2.5 text-center text-[13px] transition-colors ${months === m ? "border-accent bg-accent-soft text-accent-ink" : "border-line-2 hover:bg-bg-2"}`}>
                  <div className="font-semibold">{m === 1 ? "1 month" : `${m} months`}</div>
                  <div className="text-[12px] text-ink-2">{price === 0n ? "Free" : fmtOnly(quoteMonths(plan, m), { symbol: false })}</div>
                  {off > 0 && <span className="absolute -right-1 -top-2 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">−{off / 100}%</span>}
                </button>
              );
            })}
          </div>
          {price > 0n ? <Split gross={gross} /> : <p className="mt-4 text-[13px] text-ink-2">A free page: the transaction records your subscription, no ${site.token.symbol} moves. Gas only.</p>}
          {price > 0n && <NeedOnly need={gross} />}
          {price > 0n && <Unlimited value={unlimited} onChange={setUnlimited} />}
          {!configured && <p className="mt-3 text-[13px] text-danger">Payments are not configured on this deployment.</p>}
          <Progress step={step} error={error} txHash={txHash} />
          {step === "done" ? (
            <button type="button" className="btn btn-accent btn-block mt-3" onClick={close}>
              Close
            </button>
          ) : (
            <button type="button" className="btn btn-accent btn-block mt-3" onClick={submit} disabled={busy || !configured}>
              {busy ? <Icon name="spinner" size={16} className="spin" /> : <Icon name="lock" size={16} />}
              {price === 0n ? "Subscribe for free" : `${renewing ? "Extend" : "Subscribe"} · ${fmtOnly(gross)}`}
            </button>
          )}
          <p className="mt-3 text-[12px] text-ink-3">
            {renewing ? "Your current subscription is extended from its end date." : `Runs ${months * 30} days from now. No auto-renewal — nothing is charged again unless you come back.`}
          </p>
        </>
      )}
    </Dialog>
  );
}

const PRESETS = ["1", "5", "10", "25", "50", "100"];

export function TipDialog({ open, onClose, creator, refId, onPaid }: { open: boolean; onClose: () => void; creator: ProfileSummary; refId?: Hex; onPaid?: () => void }) {
  const { session } = useSession();
  const { pay, step, error, txHash, busy, reset, configured } = usePay();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("5");
  const [note, setNote] = useState("");
  const [unlimited, setUnlimited] = useState(true);
  const wei = parseOnly(amount);

  const close = () => {
    reset();
    onClose();
  };
  const submit = async () => {
    if (!wei || wei === 0n) return;
    const hash = await pay({ kind: "tip", creator: creator.address as Address, amount: wei, ref: refId }, { unlimited });
    if (hash) {
      // the note rides along as a DM, so the creator sees who said what with the tip
      if (note.trim()) await api(`/api/messages/${creator.handle ?? creator.address}`, { body: { text: `Tipped ${fmtOnly(wei)} — ${note.trim()}` } }).catch(() => null);
      setNote("");
      await qc.invalidateQueries();
      onPaid?.();
    }
  };

  return (
    <Dialog open={open} onClose={close} title="Send a tip">
      <div className="flex items-center gap-3">
        <Avatar profile={creator} size={48} />
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-[15px] font-semibold">
            {displayName(creator)} {creator.verified && <Icon name="verified" size={16} className="text-accent" />}
          </div>
          <div className="text-[13px] text-ink-2">{handleOf(creator)}</div>
        </div>
      </div>
      {!session ? (
        <SignInFirst />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-6 gap-2">
            {PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => setAmount(p)} className={`rounded-[8px] border py-2 text-[13px] font-semibold transition-colors ${amount === p ? "border-accent bg-accent-soft text-accent-ink" : "border-line-2 hover:bg-bg-2"}`}>
                {p}
              </button>
            ))}
          </div>
          <div className="relative mt-3">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="field pr-16 text-[16px]" aria-label="Tip amount" />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-2">{site.token.symbol}</span>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a message (optional)" className="field mt-3 text-[14px]" maxLength={300} aria-label="Message with the tip" />
          {wei && wei > 0n ? <Split gross={wei} /> : <p className="mt-3 text-[13px] text-danger">Enter an amount.</p>}
          {wei && wei > 0n ? <NeedOnly need={wei} /> : null}
          <Unlimited value={unlimited} onChange={setUnlimited} />
          <Progress step={step} error={error} txHash={txHash} />
          {step === "done" ? (
            <button type="button" className="btn btn-accent btn-block mt-3" onClick={close}>
              Close
            </button>
          ) : (
            <button type="button" className="btn btn-accent btn-block mt-3" onClick={submit} disabled={busy || !configured || !wei || wei === 0n}>
              {busy ? <Icon name="spinner" size={16} className="spin" /> : <Icon name="coin" size={16} />}
              Send {wei ? fmtOnly(wei) : ""}
            </button>
          )}
        </>
      )}
    </Dialog>
  );
}

export function UnlockDialog({ open, onClose, creator, contentId, price, what, onPaid }: { open: boolean; onClose: () => void; creator: ProfileSummary; contentId: Hex; price: bigint; what: string; onPaid?: () => void }) {
  const { session } = useSession();
  const { pay, step, error, txHash, busy, reset, configured } = usePay();
  const qc = useQueryClient();
  const [unlimited, setUnlimited] = useState(true);

  const close = () => {
    reset();
    onClose();
  };
  const submit = async () => {
    const hash = await pay({ kind: "unlock", creator: creator.address as Address, contentId, amount: price }, { unlimited });
    if (hash) {
      await qc.invalidateQueries();
      onPaid?.();
    }
  };

  return (
    <Dialog open={open} onClose={close} title={`Unlock ${what}`}>
      <div className="flex items-center gap-3">
        <Avatar profile={creator} size={48} />
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-[15px] font-semibold">
            {displayName(creator)} {creator.verified && <Icon name="verified" size={16} className="text-accent" />}
          </div>
          <div className="text-[13px] text-ink-2">{handleOf(creator)}</div>
        </div>
      </div>
      {!session ? (
        <SignInFirst />
      ) : (
        <>
          <Split gross={price} />
          <NeedOnly need={price} />
          <Unlimited value={unlimited} onChange={setUnlimited} />
          <Progress step={step} error={error} txHash={txHash} />
          {step === "done" ? (
            <button type="button" className="btn btn-accent btn-block mt-3" onClick={close}>
              Open it
            </button>
          ) : (
            <button type="button" className="btn btn-accent btn-block mt-3" onClick={submit} disabled={busy || !configured}>
              {busy ? <Icon name="spinner" size={16} className="spin" /> : <Icon name="unlock" size={16} />}
              Unlock for {fmtOnly(price)}
            </button>
          )}
          <p className="mt-3 text-[12px] text-ink-3">Yours for good: the payment is recorded to your wallet on the chain, not to an account.</p>
        </>
      )}
    </Dialog>
  );
}
