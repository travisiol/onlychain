"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Composer } from "@/components/posts/Composer";
import { PostCard } from "@/components/posts/PostCard";
import { useSession } from "@/components/session";
import { ColumnHeader, SignInDoor } from "@/components/shell/AppShell";
import { ProfileForm } from "@/components/studio/ProfileForm";
import { BlockList, Broadcast, Statements, Vault, WelcomeMessage, type Statement } from "@/components/studio/StudioTools";
import { Usd } from "@/components/Usd";
import { explorerTx } from "@/lib/chain";
import { api } from "@/lib/client/api";
import { useNow } from "@/lib/client/now";
import { STEP_LABEL, usePay } from "@/lib/client/pay";
import { displayName, fmtDate, fmtOnly, parseOnly, profileHref, timeAgo } from "@/lib/format";
import { site } from "@/lib/site";
import type { ChainEvent, CreatorStats, Plan, Post, Profile, ProfileSummary } from "@/lib/model";

type StudioData = {
  profile: Profile;
  plan: Plan;
  earned: string;
  earnedLast30: string;
  stats: CreatorStats;
  subscribers: (ProfileSummary & { until: number })[];
  posts: Post[];
  activity: (ChainEvent & { fanProfile: ProfileSummary })[];
  statements: Statement[];
};

/**
 * The creator side. Not a creator yet: the two steps (a page, then a
 * price onchain). A creator: what the chain says you earned, who is
 * subscribed, your plan, your posts, the recent payments.
 */
export function Studio() {
  const { session, profile } = useSession();
  const now = useNow();
  const data = useQuery({
    queryKey: ["studio", session?.address],
    queryFn: () => api<StudioData>("/api/studio"),
    enabled: Boolean(session),
    refetchInterval: 30_000,
  });

  if (!session) {
    return (
      <>
        <ColumnHeader title="Studio" />
        <SignInDoor what="your studio" />
      </>
    );
  }

  if (profile && !profile.isCreator) {
    return (
      <>
        <ColumnHeader title="Become a creator" />
        <div className="p-4">
          <div className="card p-5">
            <h2 className="text-[18px] font-bold">Open your page</h2>
            <p className="mt-1 text-[14px] text-ink-2">
              A handle, a name, a line about you. Then set your monthly price — it lives on the chain, and {100 - site.feeBps / 100}% of every payment lands in this wallet the moment a fan pays.
            </p>
            <ProfileForm becomeCreator />
          </div>
        </div>
      </>
    );
  }

  const d = data.data;
  return (
    <>
      <ColumnHeader title="Studio" sub={profile ? `${displayName(profile)} · ${profile.handle ? `@${profile.handle}` : ""}` : undefined} />
      {data.isPending && <p className="p-4 text-[14px] text-ink-2">Loading…</p>}
      {d && (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-[13px]">
            <span className="text-ink-2">Your earnings are already in your wallet — nothing is held here.</span>
            <Link href="/wallet#cashout" className="btn btn-outline btn-sm">
              <Icon name="coin" size={14} /> Withdraw
            </Link>
          </div>
          <section className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <Stat label="Earned" value={fmtOnly(d.earned)} hint={<Usd wei={d.earned} />} />
            <Stat label="Last 30 days" value={fmtOnly(d.earnedLast30)} hint={<Usd wei={d.earnedLast30} />} />
            <Stat label="Subscribers" value={String(d.stats.subscribers)} hint="active now" />
            <Stat label="Posts" value={String(d.stats.posts)} hint={`${d.stats.likes} likes`} />
          </section>

          <PlanEditor plan={d.plan} />

          <section className="border-t border-line">
            <h2 className="eyebrow px-4 pt-4">New post</h2>
            <Composer />
          </section>

          <WelcomeMessage profile={d.profile} />
          <Broadcast subscribers={d.stats.subscribers} />
          <Statements rows={d.statements} />

          {d.activity.length > 0 && (
            <section className="border-t border-line">
              <h2 className="eyebrow px-4 pt-4">Recent payments</h2>
              <ul>
                {d.activity.slice(0, 12).map((e) => {
                  const tx = explorerTx(e.txHash);
                  return (
                    <li key={e.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-[14px]">
                      <Link href={profileHref(e.fanProfile)}>
                        <Avatar profile={e.fanProfile} size={32} />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{displayName(e.fanProfile)}</span>{" "}
                        <span className="text-ink-2">{e.kind === "subscribed" ? (Number(e.extra.months) === 0 ? "started a free trial" : `subscribed · ${e.extra.months} mo`) : e.kind === "tipped" ? "tipped" : "unlocked a post"}</span>
                        <div className="text-[12px] text-ink-3">
                          {timeAgo(e.ts, now || e.ts)}
                          {tx && (
                            <>
                              {" · "}
                              <a href={tx} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                                tx
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="mono font-medium text-success">+{fmtOnly(BigInt(e.amount) - BigInt(e.fee))}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {d.subscribers.length > 0 && (
            <section className="border-t border-line">
              <h2 className="eyebrow px-4 pt-4">Subscribers</h2>
              <ul className="grid gap-2 p-4 sm:grid-cols-2">
                {d.subscribers.map((s) => (
                  <li key={s.address} className="flex items-center gap-3 rounded-[8px] border border-line px-3 py-2">
                    <Avatar profile={s} size={36} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/messages/${s.handle ?? s.address}`} className="block truncate text-[14px] font-medium hover:underline">
                        {displayName(s)}
                      </Link>
                      <div className="text-[12px] text-ink-3">until {fmtDate(s.until)}</div>
                    </div>
                    <Link href={`/messages/${s.handle ?? s.address}`} className="icon-btn" aria-label="Message">
                      <Icon name="message" size={18} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="border-t border-line">
            <h2 className="eyebrow px-4 pt-4">Your posts</h2>
            {d.posts.length === 0 && <p className="px-4 py-6 text-[14px] text-ink-2">Nothing posted yet.</p>}
            {d.posts.map((p) => (
              <PostCard key={p.id} post={p} onChange={() => data.refetch()} />
            ))}
          </section>

          <Vault />
          <BlockList />
        </>
      )}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="eyebrow">{label}</div>
      <div className="mt-1 truncate text-[20px] font-bold tracking-[-0.02em]">{value}</div>
      <div className="text-[12px] text-ink-3">{hint}</div>
    </div>
  );
}

/** Price, bundle discounts, free trial and open/closed — one transaction. */
export function PlanEditor({ plan, onDone }: { plan: Plan; onDone?: () => void }) {
  const qc = useQueryClient();
  const { pay, step, error, busy, txHash } = usePay();
  const [price, setPrice] = useState(plan ? fmtOnly(plan.monthlyPrice, { symbol: false, maxDecimals: 6 }).replace(/,/g, "") : "10");
  const [open, setOpen] = useState(plan ? plan.open : true);
  const [d3, setD3] = useState(String(plan ? plan.discount3Bps / 100 : 0));
  const [d6, setD6] = useState(String(plan ? plan.discount6Bps / 100 : 0));
  const [d12, setD12] = useState(String(plan ? plan.discount12Bps / 100 : 0));
  const [trial, setTrial] = useState(String(plan ? plan.trialDays : 0));
  const wei = parseOnly(price);
  const pct = (v: string) => (/^\d{1,2}(\.\d{0,2})?$/.test(v.trim()) ? Math.round(Number(v) * 100) : NaN);
  const bps = { d3: pct(d3), d6: pct(d6), d12: pct(d12) };
  const trialDays = /^\d{1,2}$/.test(trial.trim()) ? Number(trial) : NaN;
  const valid = wei !== null && [bps.d3, bps.d6, bps.d12].every((b) => Number.isFinite(b) && b <= 5000) && Number.isFinite(trialDays) && trialDays <= 30;
  const changed = !plan || wei?.toString() !== plan.monthlyPrice || open !== plan.open || bps.d3 !== plan.discount3Bps || bps.d6 !== plan.discount6Bps || bps.d12 !== plan.discount12Bps || trialDays !== plan.trialDays;

  const save = async () => {
    if (!valid || wei === null) return;
    const hash = await pay({ kind: "setPlan", monthlyPrice: wei, open, discount3Bps: bps.d3, discount6Bps: bps.d6, discount12Bps: bps.d12, trialDays });
    if (hash) {
      await qc.invalidateQueries();
      onDone?.();
    }
  };

  return (
    <section className="border-t border-line px-4 py-4">
      <h2 className="eyebrow">Subscription plan</h2>
      <p className="mt-1 text-[13px] text-ink-2">
        {plan
          ? `Live on the chain: ${BigInt(plan.monthlyPrice) === 0n ? "free page" : `${fmtOnly(plan.monthlyPrice)} / month`}, ${plan.open ? "accepting subscribers" : "closed to new subscribers"}${plan.trialDays ? `, ${plan.trialDays}-day free trial` : ""}.`
          : "Not set yet — fans cannot subscribe until this is on the chain."}{" "}
        Changing it never touches existing subscriptions.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Monthly price</span>
          <span className="relative block">
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="field pr-16" />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-ink-2">{site.token.symbol}</span>
          </span>
          <span className="mt-1 block text-[12px] text-ink-3">{wei !== null ? <Usd wei={wei} /> : null}</span>
        </label>
        <label className="block">
          <span className="field-label">Free trial</span>
          <span className="relative block">
            <input value={trial} onChange={(e) => setTrial(e.target.value)} inputMode="numeric" className="field pr-16" />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-ink-2">days</span>
          </span>
          <span className="mt-1 block text-[12px] text-ink-3">0 = none, up to 30. A new fan can take it once.</span>
        </label>
      </div>
      <div className="mt-3">
        <span className="field-label">Bundle discounts (off the total)</span>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ["3 months", d3, setD3],
              ["6 months", d6, setD6],
              ["12 months", d12, setD12],
            ] as [string, string, (v: string) => void][]
          ).map(([label, v, set]) => (
            <label key={label} className="block">
              <span className="relative block">
                <input value={v} onChange={(e) => set(e.target.value)} inputMode="numeric" className="field pr-8" aria-label={`${label} discount`} />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-ink-2">%</span>
              </span>
              <span className="mt-1 block text-[12px] text-ink-3">{label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex h-11 items-center gap-2 text-[14px]">
          <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} className="accent-[var(--color-accent)]" /> Accepting subscribers
        </label>
        <button type="button" className="btn btn-accent" onClick={save} disabled={busy || !valid || !changed}>
          {busy ? <Icon name="spinner" size={16} className="spin" /> : null} {plan ? "Update plan" : "Set plan"}
        </button>
      </div>
      <div className="mt-2 min-h-[18px] text-[13px]">
        {!valid && <span className="text-danger">Price is a number (0 for a free page); discounts 0–50 %; trial 0–30 days.</span>}
        {busy && <span className="text-ink-2">{STEP_LABEL[step]}</span>}
        {error && <span className="text-danger">{error}</span>}
        {step === "done" && txHash && <span className="text-success">Plan saved on the chain.</span>}
      </div>
    </section>
  );
}
