"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { useSession } from "@/components/session";
import { api } from "@/lib/client/api";
import { displayName, fmtOnly, parseOnly } from "@/lib/format";
import { site } from "@/lib/site";
import type { Profile, ProfileSummary } from "@/lib/model";

/**
 * The creator tools the reference has beyond posting: the welcome message
 * new subscribers get, one message to every subscriber, monthly statements,
 * the vault of uploads, the block list.
 */

export function WelcomeMessage({ profile }: { profile: Profile }) {
  const { setProfile } = useSession();
  const [text, setText] = useState(profile.welcomeMessage);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setBusy(true);
    setSaved(false);
    try {
      const res = await api<{ profile: Profile }>("/api/me", { method: "PATCH", body: { welcomeMessage: text } });
      setProfile(res.profile);
      setSaved(true);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="border-t border-line px-4 py-4">
      <h2 className="eyebrow">Welcome message</h2>
      <p className="mt-1 text-[13px] text-ink-2">Sent to every new subscriber (free trials included) as a DM from you, the moment their subscription lands on the chain. Leave empty for none.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="field mt-3" rows={2} maxLength={1000} placeholder="Welcome! Glad you're here — tell me what you'd like to see more of." />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" className="btn btn-accent btn-sm" onClick={save} disabled={busy || text === profile.welcomeMessage}>
          Save
        </button>
        {saved && <span className="text-[13px] text-success">Saved.</span>}
      </div>
    </section>
  );
}

export function Broadcast({ subscribers }: { subscribers: number }) {
  const [text, setText] = useState("");
  const [upload, setUpload] = useState<{ id: string; url: string; mime: string } | null>(null);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const wei = price ? parseOnly(price) : null;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      setUpload((await api<{ media: { id: string; url: string; mime: string } }>("/api/upload", { form })).media);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const send = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await api<{ sent: number }>("/api/messages/broadcast", { body: { text, mediaId: upload?.id ?? null, price: wei ? wei.toString() : "0" } });
      setDone(res.sent);
      setText("");
      setUpload(null);
      setPrice("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="border-t border-line px-4 py-4">
      <h2 className="eyebrow">Message all subscribers</h2>
      <p className="mt-1 text-[13px] text-ink-2">
        One message, {subscribers} {subscribers === 1 ? "thread" : "threads"} — every active subscriber gets it in their DMs. Attach a file and put a price on it to sell it to all of them at once.
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="field mt-3" rows={2} maxLength={2000} placeholder="New set is up — thank you all for this month." />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
          <Icon name="image" size={14} /> {upload ? "Change file" : "Attach a file"}
        </button>
        {upload && (
          <>
            <span className="text-[12px] text-ink-2">{upload.mime}</span>
            <div className="relative">
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="Price (optional)" className="field h-8 w-[170px] rounded-full pr-14 text-[13px]" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-ink-2">{site.token.symbol}</span>
            </div>
          </>
        )}
        <span className="flex-1" />
        <button type="button" className="btn btn-accent btn-sm" onClick={send} disabled={busy || subscribers === 0 || (!text.trim() && !upload) || (price !== "" && (!wei || wei === 0n))}>
          {busy ? <Icon name="spinner" size={14} className="spin" /> : <Icon name="send" size={14} />} Send to {subscribers}
        </button>
      </div>
      {done !== null && <p className="mt-2 text-[13px] text-success">Sent to {done} subscriber{done === 1 ? "" : "s"}.</p>}
      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
    </section>
  );
}

export type Statement = { month: string; gross: string; fee: string; net: string; subscriptions: number; tips: number; unlocks: number };

export function Statements({ rows }: { rows: Statement[] }) {
  const csv = () => {
    const lines = ["month,gross_only,platform_fee_only,net_only,subscriptions,tips,unlocks", ...rows.map((r) => [r.month, fmtOnly(r.gross, { symbol: false, maxDecimals: 6 }).replace(/,/g, ""), fmtOnly(r.fee, { symbol: false, maxDecimals: 6 }).replace(/,/g, ""), fmtOnly(r.net, { symbol: false, maxDecimals: 6 }).replace(/,/g, ""), r.subscriptions, r.tips, r.unlocks].join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `onlychain-statements.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <section className="border-t border-line px-4 py-4">
      <div className="flex items-center justify-between">
        <h2 className="eyebrow">Statements</h2>
        {rows.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={csv}>
            Download CSV
          </button>
        )}
      </div>
      <p className="mt-1 text-[13px] text-ink-2">Every payment the chain recorded for you, by calendar month. Net is what reached your wallet.</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-ink-3">No payments yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-3">
                <th className="py-1.5 pr-3 font-semibold">Month</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Gross</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Fee</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Net</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Subs</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Tips</th>
                <th className="py-1.5 text-right font-semibold">Unlocks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month} className="border-t border-line">
                  <td className="py-2 pr-3 font-medium">{r.month}</td>
                  <td className="mono py-2 pr-3 text-right">{fmtOnly(r.gross, { symbol: false })}</td>
                  <td className="mono py-2 pr-3 text-right text-ink-2">{fmtOnly(r.fee, { symbol: false })}</td>
                  <td className="mono py-2 pr-3 text-right font-semibold text-success">{fmtOnly(r.net, { symbol: false })}</td>
                  <td className="py-2 pr-3 text-right">{r.subscriptions}</td>
                  <td className="py-2 pr-3 text-right">{r.tips}</td>
                  <td className="py-2 text-right">{r.unlocks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type VaultItem = { id: string; url: string; mime: string; kind: "image" | "video"; bytes: number; createdAt: number; usedInPosts: number; usedInMessages: number; isAvatar: boolean; isCover: boolean };

export function Vault() {
  const data = useQuery({ queryKey: ["vault"], queryFn: () => api<{ media: VaultItem[] }>("/api/vault") });
  const items = data.data?.media ?? [];
  return (
    <section className="border-t border-line px-4 py-4">
      <h2 className="eyebrow">Vault</h2>
      <p className="mt-1 text-[13px] text-ink-2">Everything you uploaded, and where it is used. Pick from here in the composer to reuse a file.</p>
      {data.isPending && <p className="mt-3 text-[13px] text-ink-3">Loading…</p>}
      {data.data && items.length === 0 && <p className="mt-3 text-[13px] text-ink-3">No uploads yet.</p>}
      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
        {items.map((m) => (
          <div key={m.id} className="relative aspect-square overflow-hidden rounded-[6px] border border-line bg-bg-3" title={`${m.usedInPosts} post(s), ${m.usedInMessages} message(s)`}>
            {m.kind === "video" ? (
              <span className="flex h-full w-full items-center justify-center text-ink-2">
                <Icon name="video" size={20} />
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt="" className="h-full w-full object-cover" loading="lazy" />
            )}
            <span className="absolute bottom-1 left-1 rounded-full bg-black/55 px-1.5 text-[10px] font-semibold text-white">{m.isAvatar ? "avatar" : m.isCover ? "cover" : m.usedInPosts > 0 ? `${m.usedInPosts} post` : m.usedInMessages > 0 ? `${m.usedInMessages} DM` : "unused"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function BlockList() {
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ["blocks"], queryFn: () => api<{ blocked: ProfileSummary[] }>("/api/blocks") });
  const list = data.data?.blocked ?? [];
  return (
    <section className="border-t border-line px-4 py-4">
      <h2 className="eyebrow">Blocked wallets</h2>
      <p className="mt-1 text-[13px] text-ink-2">A blocked wallet cannot message you or comment on your posts. What it paid for on the chain stays its own — a subscription is not a permission you grant, it is a record.</p>
      {data.data && list.length === 0 && <p className="mt-3 text-[13px] text-ink-3">Nobody blocked. Block from a conversation&apos;s menu.</p>}
      <ul className="mt-3 space-y-2">
        {list.map((p) => (
          <li key={p.address} className="flex items-center gap-3 text-[14px]">
            <Avatar profile={p} size={32} />
            <span className="flex-1 truncate">{displayName(p)}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                await api("/api/blocks", { body: { address: p.address, on: false } });
                qc.invalidateQueries({ queryKey: ["blocks"] });
              }}
            >
              Unblock
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
