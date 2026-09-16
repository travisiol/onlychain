"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { useSession } from "@/components/session";
import { api } from "@/lib/client/api";
import { useNow } from "@/lib/client/now";
import { parseOnly } from "@/lib/format";
import { site } from "@/lib/site";
import type { Post, PostAccess } from "@/lib/model";

type Upload = { id: string; url: string; mime: string };
type VaultItem = { id: string; url: string; mime: string; kind: "image" | "video"; createdAt: number };

/**
 * The "compose new post" box: text, up to ten files (uploaded now or picked
 * from the vault), who may see it, a price for pay-per-view, and an optional
 * publish time — a scheduled post is the creator's alone until then.
 */
export function Composer({ onPosted, autoFocus = false }: { onPosted?: (p: Post) => void; autoFocus?: boolean }) {
  const { profile } = useSession();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [access, setAccess] = useState<PostAccess>("subscribers");
  const [price, setPrice] = useState("10");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState("");
  const [vaultOpen, setVaultOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const now = useNow();
  const vault = useQuery({ queryKey: ["vault"], queryFn: () => api<{ media: VaultItem[] }>("/api/vault"), enabled: vaultOpen });

  if (!profile) return null;
  if (!profile.isCreator) {
    return (
      <div className="border-b border-line px-4 py-4 text-[14px] text-ink-2">
        Posting is for creators.{" "}
        <Link href="/studio" className="text-accent hover:underline">
          Set up your creator page
        </Link>{" "}
        — a handle, a name, a price — and this box turns into your composer.
      </div>
    );
  }

  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 10 - uploads.length)) {
        const form = new FormData();
        form.append("file", file);
        const res = await api<{ media: Upload }>("/api/upload", { form });
        setUploads((u) => [...u, res.media]);
      }
      qc.invalidateQueries({ queryKey: ["vault"] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const wei = access === "ppv" ? parseOnly(price) : null;
  const publishAt = schedule ? new Date(schedule).getTime() : null;
  const scheduleOk = publishAt === null || (Number.isFinite(publishAt) && publishAt > now);
  const canPost = !busy && !uploading && (text.trim() || uploads.length > 0) && (access !== "ppv" || (wei && wei > 0n)) && scheduleOk;

  const submit = async () => {
    if (!canPost) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ post: Post }>("/api/posts", { body: { text, mediaIds: uploads.map((u) => u.id), access, price: wei ? wei.toString() : "0", publishAt } });
      setText("");
      setUploads([]);
      setSchedule("");
      await qc.invalidateQueries();
      onPosted?.(res.post);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-line px-4 py-4">
      <div className="flex gap-3">
        <Avatar profile={profile} size={42} />
        <div className="min-w-0 flex-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Compose new post…"
            rows={text.length > 80 ? 4 : 2}
            autoFocus={autoFocus}
            className="w-full resize-none border-0 bg-transparent p-0 pt-2 text-[16px] leading-snug outline-none placeholder:text-ink-3"
            maxLength={4000}
          />
          {uploads.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {uploads.map((u, i) => (
                <div key={u.id} className="relative h-24 w-24 overflow-hidden rounded-[8px] border border-line bg-bg-3">
                  {u.mime.startsWith("video/") ? (
                    <span className="flex h-full w-full items-center justify-center text-ink-2">
                      <Icon name="video" size={22} />
                    </span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.url} alt="" className="h-full w-full object-cover" />
                  )}
                  <span className="absolute left-1 top-1 rounded-full bg-black/55 px-1.5 text-[10px] font-semibold text-white">{i + 1}</span>
                  <button type="button" className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-white hover:bg-ink" onClick={() => setUploads((list) => list.filter((x) => x.id !== u.id))} aria-label="Remove">
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {vaultOpen && (
            <div className="mt-2 rounded-[8px] border border-line p-2">
              <div className="mb-2 flex items-center justify-between text-[12px] text-ink-2">
                <span>From your vault</span>
                <button type="button" className="text-accent hover:underline" onClick={() => setVaultOpen(false)}>
                  Close
                </button>
              </div>
              {vault.isPending && <p className="text-[12px] text-ink-3">Loading…</p>}
              {vault.data && vault.data.media.length === 0 && <p className="text-[12px] text-ink-3">Nothing uploaded yet.</p>}
              <div className="flex flex-wrap gap-2">
                {vault.data?.media.map((m) => {
                  const picked = uploads.some((u) => u.id === m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`relative h-16 w-16 overflow-hidden rounded-[6px] border ${picked ? "border-accent ring-2 ring-accent/40" : "border-line"}`}
                      onClick={() => setUploads((list) => (picked ? list.filter((x) => x.id !== m.id) : list.length < 10 ? [...list, { id: m.id, url: m.url, mime: m.mime }] : list))}
                      aria-label={picked ? "Remove" : "Add"}
                    >
                      {m.kind === "video" ? (
                        <span className="flex h-full w-full items-center justify-center bg-bg-3 text-ink-2">
                          <Icon name="video" size={18} />
                        </span>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.url} alt="" className="h-full w-full object-cover" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 pl-[54px]">
        <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" className="hidden" onChange={(e) => pick(e.target.files)} />
        <button type="button" className="icon-btn" onClick={() => fileRef.current?.click()} disabled={uploading || uploads.length >= 10} aria-label="Attach photos or videos" title="Attach photos or videos (up to 10)">
          {uploading ? <Icon name="spinner" size={20} className="spin" /> : <Icon name="image" size={22} />}
        </button>
        <button type="button" className={`icon-btn ${vaultOpen ? "is-on" : ""}`} onClick={() => setVaultOpen((v) => !v)} aria-label="Pick from vault" title="Pick from your vault">
          <Icon name="bookmark" size={20} />
        </button>
        <div className="flex items-center overflow-hidden rounded-full border border-line-2 text-[12px] font-semibold uppercase tracking-[0.04em]">
          {(["free", "subscribers", "ppv"] as PostAccess[]).map((a) => (
            <button key={a} type="button" onClick={() => setAccess(a)} className={`px-3 py-1.5 transition-colors ${access === a ? "bg-accent text-white" : "text-ink-2 hover:bg-bg-2"}`}>
              {a === "free" ? "Everyone" : a === "subscribers" ? "Subscribers" : "Pay-per-view"}
            </button>
          ))}
        </div>
        {access === "ppv" && (
          <div className="relative">
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="field h-8 w-[130px] rounded-full pr-14 text-[13px]" aria-label="Price" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-ink-2">{site.token.symbol}</span>
          </div>
        )}
        <label className="flex items-center gap-1.5 text-[12px] text-ink-2" title="Publish later">
          <Icon name="clock" size={16} />
          <input type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} className="field h-8 w-[190px] rounded-full text-[12px]" aria-label="Publish at" />
          {schedule && (
            <button type="button" className="text-ink-3 hover:text-ink" onClick={() => setSchedule("")} aria-label="Clear schedule">
              <Icon name="x" size={14} />
            </button>
          )}
        </label>
        <span className="flex-1" />
        <button type="button" className="btn btn-accent" onClick={submit} disabled={!canPost}>
          {busy ? <Icon name="spinner" size={16} className="spin" /> : null} {schedule ? "Schedule" : "Post"}
        </button>
      </div>
      {!scheduleOk && <p className="mt-2 pl-[54px] text-[13px] text-danger">Pick a time in the future.</p>}
      {error && <p className="mt-2 pl-[54px] text-[13px] text-danger">{error}</p>}
    </div>
  );
}
