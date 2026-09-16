"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { useSession } from "@/components/session";
import { ColumnHeader } from "@/components/shell/AppShell";
import { api } from "@/lib/client/api";
import { useNow } from "@/lib/client/now";
import { displayName, timeAgo } from "@/lib/format";
import type { Conversation } from "@/lib/model";

/** Inbox: one row per wallet you talk to, unread count, last line. */
export function Conversations({ active }: { active?: string } = {}) {
  const { session } = useSession();
  const now = useNow();
  const data = useQuery({
    queryKey: ["conversations", session?.address],
    queryFn: () => api<{ conversations: Conversation[] }>("/api/messages"),
    enabled: Boolean(session),
    refetchInterval: 15_000,
  });

  if (!session) return null;
  const list = data.data?.conversations ?? [];
  const isActive = (peer: Conversation["peer"]) => active !== undefined && (active.toLowerCase() === peer.address.toLowerCase() || active.replace(/^@/, "").toLowerCase() === (peer.handle ?? "").toLowerCase());
  return (
    <>
      <ColumnHeader title="Messages" />
      {data.isPending && <div className="p-4 text-[14px] text-ink-2">Loading…</div>}
      {data.data && list.length === 0 && (
        <div className="px-6 py-16 text-center">
          <Icon name="message" size={40} className="mx-auto text-ink-3" />
          <h2 className="mt-3 text-[18px] font-bold">No messages yet</h2>
          <p className="mx-auto mt-1 max-w-[360px] text-[14px] text-ink-2">Open a creator&apos;s page and tap the message icon. Creators can send you files behind a price — unlock them here.</p>
        </div>
      )}
      <ul>
        {list.map((c) => {
          const mine = c.last.from === session.address;
          const preview = c.last.text || (c.last.hasMedia ? (BigInt(c.last.price) > 0n ? "Sent a paid file" : "Sent a file") : "");
          return (
            <li key={c.peer.address} className="border-b border-line">
              <Link href={`/messages/${c.peer.handle ?? c.peer.address}`} className={`flex items-center gap-3 px-4 py-3 hover:bg-bg-2 ${isActive(c.peer) ? "bg-accent-soft/60" : ""}`}>
                <Avatar profile={c.peer} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex items-center gap-1 truncate text-[15px] font-semibold">
                      {displayName(c.peer)} {c.peer.verified && <Icon name="verified" size={14} className="text-accent" />}
                    </span>
                    <span className="shrink-0 text-[12px] text-ink-3">{timeAgo(c.last.createdAt, now || c.last.createdAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`truncate text-[14px] ${c.unread ? "font-medium text-ink" : "text-ink-2"}`}>
                      {mine ? "You: " : ""}
                      {preview}
                    </p>
                    {c.unread > 0 && <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">{c.unread}</span>}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
