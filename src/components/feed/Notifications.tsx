"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { Icon, type IconName } from "@/components/Icon";
import { useSession } from "@/components/session";
import { ColumnHeader, SignInDoor } from "@/components/shell/AppShell";
import { explorerTx } from "@/lib/chain";
import { api } from "@/lib/client/api";
import { useNow } from "@/lib/client/now";
import { displayName, fmtOnly, profileHref, timeAgo } from "@/lib/format";
import type { Notification } from "@/lib/model";

const ICON: Record<Notification["kind"], IconName> = { subscribed: "bookmark", renewed: "bookmark", tipped: "coin", unlocked: "unlock", like: "heart", comment: "comment" };

function line(n: Notification): string {
  switch (n.kind) {
    case "subscribed":
      return n.text === "a free trial" ? "started your free trial" : `subscribed for ${n.text} · ${fmtOnly(n.amount ?? "0")}`;
    case "renewed":
      return `renewed for ${n.text} · ${fmtOnly(n.amount ?? "0")}`;
    case "tipped":
      return `sent you a ${fmtOnly(n.amount ?? "0")} tip`;
    case "unlocked":
      return `unlocked a post for ${fmtOnly(n.amount ?? "0")}`;
    case "like":
      return "liked your post";
    case "comment":
      return `commented: “${n.text}”`;
  }
}

/** Payments received (chain) and likes / comments (site), newest first. */
export function Notifications() {
  const { session } = useSession();
  const qc = useQueryClient();
  const now = useNow();
  const data = useQuery({
    queryKey: ["notifications", session?.address],
    queryFn: async () => {
      const res = await api<{ notifications: Notification[]; unseen: number }>("/api/notifications");
      qc.setQueryData(["notifications-peek", session?.address], { unseen: 0 });
      return res;
    },
    enabled: Boolean(session),
  });

  if (!session) {
    return (
      <>
        <ColumnHeader title="Notifications" />
        <SignInDoor what="your notifications" />
      </>
    );
  }
  const list = data.data?.notifications ?? [];
  return (
    <>
      <ColumnHeader title="Notifications" />
      {data.isPending && <p className="p-4 text-[14px] text-ink-2">Loading…</p>}
      {data.data && list.length === 0 && (
        <div className="px-6 py-16 text-center">
          <Icon name="bell" size={40} className="mx-auto text-ink-3" />
          <h2 className="mt-3 text-[18px] font-bold">Nothing yet</h2>
          <p className="mx-auto mt-1 max-w-[360px] text-[14px] text-ink-2">Subscriptions, tips, unlocks, likes and comments on your posts land here — the payments straight from the chain.</p>
        </div>
      )}
      <ul>
        {list.map((n) => {
          const tx = n.txHash ? explorerTx(n.txHash) : null;
          return (
            <li key={n.id} className="flex items-start gap-3 border-b border-line px-4 py-3">
              <Link href={profileHref(n.actor)}>
                <Avatar profile={n.actor} size={44} />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-snug">
                  <Link href={profileHref(n.actor)} className="font-semibold hover:underline">
                    {displayName(n.actor)}
                  </Link>{" "}
                  {line(n)}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-ink-3">
                  <span>{timeAgo(n.createdAt, now || n.createdAt)}</span>
                  {n.postId && (
                    <Link href={`/p/${n.postId}`} className="text-accent hover:underline">
                      View post
                    </Link>
                  )}
                  {n.txHash &&
                    (tx ? (
                      <a href={tx} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                        Transaction
                      </a>
                    ) : (
                      <span className="mono">{n.txHash.slice(0, 10)}…</span>
                    ))}
                </div>
              </div>
              <span className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${n.amount ? "bg-accent-soft text-accent-ink" : "bg-bg-2 text-ink-2"}`}>
                <Icon name={ICON[n.kind]} size={16} />
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
