"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { UnlockDialog } from "@/components/pay/PayDialogs";
import { Watermark } from "@/components/posts/Watermark";
import { useSession } from "@/components/session";
import { ColumnHeader } from "@/components/shell/AppShell";
import { api } from "@/lib/client/api";
import { contentIdOf } from "@/lib/client/pay";
import { displayName, fmtOnly, handleOf, parseOnly, profileHref, shortAddress } from "@/lib/format";
import { site } from "@/lib/site";
import type { Message, ProfileSummary } from "@/lib/model";

type ThreadData = { peer: ProfileSummary; messages: Message[]; canWrite: boolean; iAmCreator: boolean; blockedByMe: boolean };
type Upload = { id: string; url: string; mime: string };

/** A conversation. Creators can attach a file and put a price on it; the recipient unlocks it onchain. */
export function Thread({ peer }: { peer: string }) {
  const { session } = useSession();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [price, setPrice] = useState("");
  const [paid, setPaid] = useState(false);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState<Message | null>(null);
  const [menu, setMenu] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const data = useQuery({
    queryKey: ["thread", peer, session?.address],
    queryFn: () => api<ThreadData>(`/api/messages/${encodeURIComponent(peer)}`),
    enabled: Boolean(session),
    refetchInterval: 8_000,
  });
  const count = data.data?.messages.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [count]);

  if (!session) return null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      setUpload((await api<{ media: Upload }>("/api/upload", { form })).media);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const wei = paid && upload ? parseOnly(price) : null;
  const canSend = !busy && !uploading && (text.trim() || upload) && (!paid || !upload || (wei && wei > 0n));

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/messages/${encodeURIComponent(peer)}`, { body: { text, mediaId: upload?.id ?? null, price: wei ? wei.toString() : "0" } });
      setText("");
      setUpload(null);
      setPaid(false);
      setPrice("");
      await data.refetch();
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const d = data.data;
  return (
    <div className="flex min-h-dvh w-full flex-col">
      <ColumnHeader
        title={d ? displayName(d.peer) : "…"}
        back
        sub={d ? handleOf(d.peer) : undefined}
        right={
          d ? (
            <div className="relative flex items-center gap-1">
              <Link href={profileHref(d.peer)} aria-label="Profile">
                <Avatar profile={d.peer} size={36} />
              </Link>
              <button type="button" className="icon-btn" onClick={() => setMenu((v) => !v)} aria-label="More">
                <Icon name="more" size={20} />
              </button>
              {menu && (
                <div className="card absolute right-0 top-11 z-20 w-[220px] py-1 shadow-[var(--shadow-pop)]" onMouseLeave={() => setMenu(false)}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-[14px] hover:bg-bg-2"
                    onClick={async () => {
                      setMenu(false);
                      await api("/api/blocks", { body: { address: d.peer.address, on: !d.blockedByMe } }).catch((err: Error) => alert(err.message));
                      data.refetch();
                    }}
                  >
                    <Icon name="shield" size={16} /> {d.blockedByMe ? "Unblock this wallet" : "Block this wallet"}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-[14px] hover:bg-bg-2"
                    onClick={async () => {
                      setMenu(false);
                      const reason = prompt("What is wrong? (a few words for the moderators)");
                      if (!reason?.trim()) return;
                      await api("/api/report", { body: { kind: "profile", target: d.peer.address, reason } }).catch((err: Error) => alert(err.message));
                      alert("Thanks — reported.");
                    }}
                  >
                    <Icon name="warn" size={16} /> Report
                  </button>
                </div>
              )}
            </div>
          ) : null
        }
      />
      {d?.blockedByMe && <p className="border-b border-line bg-bg-2 px-4 py-2 text-[13px] text-ink-2">You blocked this wallet: it cannot write to you or comment on your posts. Unblock from the menu.</p>}
      <div className="flex-1 space-y-3 px-4 py-4">
        {data.isPending && <p className="text-[14px] text-ink-2">Loading…</p>}
        {data.isError && <p className="text-[14px] text-danger">{(data.error as Error).message}</p>}
        {d && d.messages.length === 0 && <p className="py-10 text-center text-[14px] text-ink-2">Say hello to {displayName(d.peer)}.</p>}
        {d?.messages.map((m) => {
          const mine = m.from === session.address;
          const locked = m.hasMedia && !m.unlocked;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[78%] overflow-hidden rounded-[16px] ${mine ? "rounded-br-[4px] bg-accent text-white" : "rounded-bl-[4px] bg-bg-2 text-ink"}`}>
                {m.text && <p className="whitespace-pre-wrap px-3.5 py-2 text-[15px] leading-snug">{m.text}</p>}
                {m.hasMedia && m.unlocked && m.media && (
                  <div className="relative" onContextMenu={!mine && BigInt(m.price) > 0n ? (e) => e.preventDefault() : undefined}>
                    {m.media.kind === "video" ? <video src={m.media.url} controls className="max-h-[360px] w-full bg-black" /> : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.media.url} alt="" className="max-h-[360px] w-full object-cover" draggable={mine || BigInt(m.price) === 0n} />
                    )}
                    {!mine && BigInt(m.price) > 0n && <Watermark text={`${site.name} · ${shortAddress(session.address, 6)}`} />}
                  </div>
                )}
                {locked && (
                  <div className="locked-veil flex w-[260px] flex-col items-center justify-center px-4 py-8 text-center text-ink">
                    <Icon name="lock" size={24} className="text-ink-2" />
                    <p className="mt-2 text-[13px] text-ink-2">Paid file · {fmtOnly(m.price)}</p>
                    <button type="button" className="btn btn-accent btn-sm mt-3" onClick={() => setUnlocking(m)}>
                      Unlock
                    </button>
                  </div>
                )}
                {m.hasMedia && BigInt(m.price) > 0n && mine && <p className="px-3.5 pb-2 text-[11px] opacity-80">Priced at {fmtOnly(m.price)}</p>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {d && (
        <div className="sticky bottom-16 border-t border-line bg-white px-3 py-3 md:bottom-0">
          {!d.canWrite ? (
            <p className="text-[13px] text-ink-2">{d.blockedByMe ? "Unblock this wallet to write to it." : "This wallet does not accept messages from you."}</p>
          ) : (
            <>
              {upload && (
                <div className="mb-2 flex items-center gap-3 rounded-[8px] border border-line p-2">
                  {upload.mime.startsWith("video/") ? <span className="flex h-12 w-12 items-center justify-center rounded bg-bg-3"><Icon name="video" size={20} /></span> : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={upload.url} alt="" className="h-12 w-12 rounded object-cover" />
                  )}
                  {d.iAmCreator && (
                    <label className="flex items-center gap-2 text-[13px]">
                      <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="accent-[var(--color-accent)]" /> Paid
                      {paid && (
                        <span className="relative">
                          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="10" className="field h-8 w-[110px] rounded-full pr-12 text-[13px]" />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-ink-2">{site.token.symbol}</span>
                        </span>
                      )}
                    </label>
                  )}
                  <span className="flex-1" />
                  <button type="button" className="icon-btn" onClick={() => setUpload(null)} aria-label="Remove">
                    <Icon name="x" size={18} />
                  </button>
                </div>
              )}
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
                <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Attach">
                  {uploading ? <Icon name="spinner" size={20} className="spin" /> : <Icon name="image" size={22} />}
                </button>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" className="field h-10 flex-1 rounded-full" maxLength={2000} />
                <button type="submit" className="btn btn-accent h-10 w-10 !p-0" disabled={!canSend} aria-label="Send">
                  {busy ? <Icon name="spinner" size={18} className="spin" /> : <Icon name="send" size={18} />}
                </button>
              </form>
              {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
            </>
          )}
        </div>
      )}

      {unlocking && d && (
        <UnlockDialog open onClose={() => setUnlocking(null)} creator={d.peer} contentId={contentIdOf("msg", unlocking.id)} price={BigInt(unlocking.price)} what="this file" onPaid={() => data.refetch()} />
      )}
    </div>
  );
}
