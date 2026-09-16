"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { SubscribeDialog } from "@/components/pay/PayDialogs";
import { useSession } from "@/components/session";
import { ColumnHeader, SignInDoor } from "@/components/shell/AppShell";
import { explorerTx } from "@/lib/chain";
import { api } from "@/lib/client/api";
import { useNow } from "@/lib/client/now";
import { daysLeft, displayName, fmtDate, fmtOnly, handleOf, profileHref, timeAgo } from "@/lib/format";
import { site } from "@/lib/site";
import type { ChainEvent, ProfileSummary, Subscription } from "@/lib/model";

type Data = { subscriptions: Subscription[]; spent: string; history: (ChainEvent & { creatorProfile: ProfileSummary })[] };

/** What you are subscribed to (the chain's end dates), then everything you ever paid. */
export function Subscriptions() {
  const { session } = useSession();
  const qc = useQueryClient();
  const now = useNow();
  const [extend, setExtend] = useState<Subscription | null>(null);
  const data = useQuery({
    queryKey: ["subscriptions", session?.address],
    queryFn: () => api<Data>("/api/subscriptions"),
    enabled: Boolean(session),
  });

  if (!session) {
    return (
      <>
        <ColumnHeader title="Subscriptions" />
        <SignInDoor what="your subscriptions" />
      </>
    );
  }
  const d = data.data;
  const active = d?.subscriptions.filter((s) => s.active) ?? [];
  const expired = d?.subscriptions.filter((s) => !s.active) ?? [];

  return (
    <>
      <ColumnHeader title="Subscriptions" sub={d ? `${active.length} active · ${fmtOnly(d.spent)} spent all-time` : undefined} />
      {data.isPending && <p className="p-4 text-[14px] text-ink-2">Loading…</p>}
      {d && d.subscriptions.length === 0 && (
        <div className="px-6 py-16 text-center">
          <Icon name="bookmark" size={40} className="mx-auto text-ink-3" />
          <h2 className="mt-3 text-[18px] font-bold">No subscriptions yet</h2>
          <p className="mx-auto mt-1 max-w-[360px] text-[14px] text-ink-2">Every subscription is a record on the chain with an end date. Nothing renews by itself.</p>
          <Link href="/explore" className="btn btn-accent mt-5">
            Explore creators
          </Link>
        </div>
      )}

      {active.length > 0 && (
        <section>
          <h2 className="eyebrow px-4 pt-4">Active</h2>
          <ul>
            {active.map((s) => (
              <Row key={s.creator.address} s={s} now={now} onExtend={() => setExtend(s)} />
            ))}
          </ul>
        </section>
      )}
      {expired.length > 0 && (
        <section>
          <h2 className="eyebrow px-4 pt-4">Expired</h2>
          <ul>
            {expired.map((s) => (
              <Row key={s.creator.address} s={s} now={now} onExtend={() => setExtend(s)} />
            ))}
          </ul>
        </section>
      )}

      {d && d.history.length > 0 && (
        <section className="border-t border-line">
          <h2 className="eyebrow px-4 pt-4">Payments</h2>
          <ul>
            {d.history.map((e) => {
              const tx = explorerTx(e.txHash);
              return (
                <li key={e.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-[14px]">
                  <Avatar profile={e.creatorProfile} size={32} />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{displayName(e.creatorProfile)}</span>{" "}
                    <span className="text-ink-2">{e.kind === "subscribed" ? (Number(e.extra.months) === 0 ? "· free trial" : `· ${e.extra.months} month${Number(e.extra.months) > 1 ? "s" : ""}`) : e.kind === "tipped" ? "· tip" : "· unlock"}</span>
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
                  <span className="mono font-medium">−{fmtOnly(e.amount)}</span>
                </li>
              );
            })}
          </ul>
          <p className="px-4 py-3 text-[12px] text-ink-3">
            {site.feeBps / 100}% of each payment went to {site.name}; the rest went straight to the creator&apos;s wallet in the same transaction.
          </p>
        </section>
      )}

      {extend && <SubscribeDialog open onClose={() => setExtend(null)} creator={extend.creator} plan={extend.plan} currentUntil={extend.until} onPaid={() => qc.invalidateQueries()} />}
    </>
  );
}

function Row({ s, now, onExtend }: { s: Subscription; now: number; onExtend: () => void }) {
  const price = s.plan ? BigInt(s.plan.monthlyPrice) : null;
  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-3">
      <Link href={profileHref(s.creator)}>
        <Avatar profile={s.creator} size={48} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={profileHref(s.creator)} className="flex items-center gap-1 text-[15px] font-semibold hover:underline">
          {displayName(s.creator)} {s.creator.verified && <Icon name="verified" size={14} className="text-accent" />}
        </Link>
        <div className="text-[13px] text-ink-2">
          {handleOf(s.creator)}
          {s.creator.category ? ` · ${s.creator.category}` : ""}
        </div>
        <div className={`text-[12px] ${s.active ? "text-success" : "text-ink-3"}`}>{s.active ? `Until ${fmtDate(s.until)} · ${daysLeft(s.until, now || s.until * 1000)} days left` : `Expired ${fmtDate(s.until)}`}</div>
      </div>
      {s.plan?.open && (
        <button type="button" className="btn btn-outline btn-sm" onClick={onExtend}>
          {s.active ? "Extend" : "Renew"}
          {price !== null && price > 0n ? ` · ${fmtOnly(price, { symbol: false })}` : ""}
        </button>
      )}
    </li>
  );
}
