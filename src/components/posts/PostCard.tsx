"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { SubscribeDialog, TipDialog, UnlockDialog } from "@/components/pay/PayDialogs";
import { MediaCarousel } from "@/components/posts/MediaCarousel";
import { useSession } from "@/components/session";
import { api } from "@/lib/client/api";
import { contentIdOf } from "@/lib/client/pay";
import { useNow } from "@/lib/client/now";
import { displayName, fmtDate, fmtOnly, handleOf, profileHref, shortAddress, timeAgo } from "@/lib/format";
import { site } from "@/lib/site";
import type { Plan, Post } from "@/lib/model";

/**
 * One post, as the reference lays it out: header, text, media, actions,
 * like count. A locked post shows the veil — never the image — with the
 * one button that opens it: subscribe, or unlock at the price. The owner's
 * menu edits, pins, deletes; anyone can save, copy the link, or report.
 */
export function PostCard({ post, onChange, detail = false }: { post: Post; onChange?: (p: Post) => void; detail?: boolean }) {
  const { session } = useSession();
  const qc = useQueryClient();
  const now = useNow();
  const [dialog, setDialog] = useState<null | "subscribe" | "tip" | "unlock">(null);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mine = session?.address === post.creator.address;

  const plan = useQuery({
    queryKey: ["plan", post.creator.address],
    queryFn: () => api<{ plan: Plan; viewerUntil: number; viewerTrial: boolean }>(`/api/creators/${post.creator.address}`),
    enabled: dialog === "subscribe",
    staleTime: 15_000,
  });

  const toggleLike = async () => {
    if (!session) return;
    const res = await api<{ liked: boolean; likes: number }>(`/api/posts/${post.id}/like`, { body: {} }).catch(() => null);
    if (res) onChange?.({ ...post, liked: res.liked, likes: res.likes });
  };
  const toggleBookmark = async () => {
    if (!session) return;
    const res = await api<{ bookmarked: boolean }>(`/api/posts/${post.id}/bookmark`, { body: {} }).catch(() => null);
    if (res) {
      onChange?.({ ...post, bookmarked: res.bookmarked });
      qc.invalidateQueries({ queryKey: ["collections"] });
    }
  };
  const patch = async (body: { text?: string; pinned?: boolean }) => {
    setBusy(true);
    try {
      const res = await api<{ post: Post }>(`/api/posts/${post.id}`, { method: "PATCH", body });
      onChange?.(res.post);
      await qc.invalidateQueries();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
      setMenu(false);
      setEditing(null);
    }
  };
  const remove = async () => {
    if (!confirm("Delete this post?")) return;
    await api(`/api/posts/${post.id}`, { method: "DELETE" }).catch(() => null);
    await qc.invalidateQueries();
    setMenu(false);
  };
  const report = async () => {
    setMenu(false);
    const reason = prompt("What is wrong with this post? (a few words for the moderators)");
    if (!reason?.trim()) return;
    try {
      await api("/api/report", { body: { kind: "post", target: post.id, reason } });
      alert("Thanks — reported.");
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <article className="border-b border-line bg-white">
      {post.pinned && (
        <div className="flex items-center gap-1.5 px-4 pt-3 text-[12px] font-medium text-ink-2">
          <Icon name="star" size={13} /> Pinned
        </div>
      )}
      {post.scheduled && (
        <div className="flex items-center gap-1.5 px-4 pt-3 text-[12px] font-medium text-accent-ink">
          <Icon name="clock" size={13} /> Scheduled for {fmtDate(post.createdAt)} — only you can see it until then
        </div>
      )}
      <header className="flex items-center gap-3 px-4 pt-4">
        <Link href={profileHref(post.creator)}>
          <Avatar profile={post.creator} size={42} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={profileHref(post.creator)} className="flex items-center gap-1 text-[15px] font-semibold hover:underline">
            <span className="truncate">{displayName(post.creator)}</span>
            {post.creator.verified && <Icon name="verified" size={16} className="shrink-0 text-accent" />}
          </Link>
          <div className="truncate text-[13px] text-ink-2">{handleOf(post.creator)}</div>
        </div>
        <Link href={`/p/${post.id}`} className="text-[13px] text-ink-2 hover:underline" title={new Date(post.createdAt).toLocaleString()}>
          {post.scheduled ? fmtDate(post.createdAt) : timeAgo(post.createdAt, now || post.createdAt)}
        </Link>
        <div className="relative">
          <button type="button" className="icon-btn -mr-2" onClick={() => setMenu((v) => !v)} aria-label="More">
            <Icon name="more" size={20} />
          </button>
          {menu && (
            <div className="card absolute right-0 top-9 z-20 w-[210px] py-1 shadow-[var(--shadow-pop)]" onMouseLeave={() => setMenu(false)}>
              <MenuItem
                icon="link"
                label="Copy link"
                onClick={() => {
                  navigator.clipboard?.writeText(`${location.origin}/p/${post.id}`);
                  setMenu(false);
                }}
              />
              {session && !mine && <MenuItem icon="warn" label="Report" onClick={report} />}
              {mine && <MenuItem icon="star" label={post.pinned ? "Unpin from page" : "Pin to page"} onClick={() => patch({ pinned: !post.pinned })} disabled={busy} />}
              {mine && (
                <MenuItem
                  icon="settings"
                  label="Edit text"
                  onClick={() => {
                    setEditing(post.text);
                    setMenu(false);
                  }}
                />
              )}
              {mine && <MenuItem icon="trash" label="Delete" onClick={remove} danger />}
            </div>
          )}
        </div>
      </header>

      {editing !== null ? (
        <div className="px-4 pt-3">
          <textarea value={editing} onChange={(e) => setEditing(e.target.value)} className="field" rows={3} maxLength={4000} />
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-accent btn-sm" onClick={() => patch({ text: editing })} disabled={busy}>
              Save
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        post.text && <p className="whitespace-pre-wrap px-4 pt-3 text-[15px] leading-[1.5]">{post.text}</p>
      )}

      {post.mediaCount > 0 && (
        <div className="mt-3">
          {post.unlocked && post.media.length > 0 ? <MediaCarousel media={post.media} watermark={post.access !== "free" && session && !mine ? `${site.name} · ${shortAddress(session.address, 6)}` : undefined} /> : <LockedVeil post={post} onSubscribe={() => setDialog("subscribe")} onUnlock={() => setDialog("unlock")} signedIn={Boolean(session)} />}
        </div>
      )}

      {post.mediaCount === 0 && !post.unlocked && <LockedVeil post={post} onSubscribe={() => setDialog("subscribe")} onUnlock={() => setDialog("unlock")} signedIn={Boolean(session)} compact />}

      <footer className="px-2 pb-2 pt-1">
        <div className="flex items-center">
          <button type="button" className={`icon-btn ${post.liked ? "is-on" : ""}`} onClick={toggleLike} aria-label={post.liked ? "Unlike" : "Like"} disabled={!session || !post.unlocked}>
            <Icon name="heart" size={22} className={post.liked ? "is-filled" : ""} />
          </button>
          <Link href={`/p/${post.id}`} className="icon-btn" aria-label="Comments">
            <Icon name="comment" size={22} />
          </Link>
          {!mine && (
            <button type="button" className="ml-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-2 hover:bg-bg-2 hover:text-ink" onClick={() => setDialog("tip")}>
              <Icon name="coin" size={18} /> Send tip
            </button>
          )}
          <span className="flex-1" />
          {post.sample && <span className="mr-2 rounded-full bg-bg-3 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-2">Sample</span>}
          {post.access !== "free" && (
            <span className="mr-1 inline-flex items-center gap-1 text-[12px] text-ink-2" title={post.access === "ppv" ? "Pay-per-view" : "Subscribers only"}>
              <Icon name={post.unlocked ? "unlock" : "lock"} size={14} /> {post.access === "ppv" ? fmtOnly(post.price) : "Subscribers"}
            </span>
          )}
          {session && (
            <button type="button" className={`icon-btn ${post.bookmarked ? "is-on" : ""}`} onClick={toggleBookmark} aria-label={post.bookmarked ? "Remove from collections" : "Save to collections"} title={post.bookmarked ? "Saved" : "Save"}>
              <Icon name="bookmark" size={20} className={post.bookmarked ? "is-filled" : ""} />
            </button>
          )}
        </div>
        <div className="px-2 text-[13px] font-semibold">
          {post.likes} {post.likes === 1 ? "like" : "likes"}
          {post.comments > 0 && !detail && (
            <Link href={`/p/${post.id}`} className="ml-3 font-normal text-ink-2 hover:underline">
              View {post.comments === 1 ? "1 comment" : `all ${post.comments} comments`}
            </Link>
          )}
        </div>
      </footer>

      <SubscribeDialog open={dialog === "subscribe"} onClose={() => setDialog(null)} creator={post.creator} plan={plan.data?.plan ?? null} currentUntil={plan.data?.viewerUntil ?? 0} trialAvailable={plan.data?.viewerTrial ?? false} onPaid={() => qc.invalidateQueries()} />
      <TipDialog open={dialog === "tip"} onClose={() => setDialog(null)} creator={post.creator} refId={contentIdOf("post", post.id)} />
      <UnlockDialog open={dialog === "unlock"} onClose={() => setDialog(null)} creator={post.creator} contentId={contentIdOf("post", post.id)} price={BigInt(post.price || "0")} what="this post" onPaid={() => qc.invalidateQueries()} />
    </article>
  );
}

function MenuItem({ icon, label, onClick, danger = false, disabled = false }: { icon: "link" | "warn" | "star" | "settings" | "trash"; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className={`flex w-full items-center gap-2 px-4 py-2 text-left text-[14px] hover:bg-bg-2 disabled:opacity-50 ${danger ? "text-danger" : ""}`} onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={16} /> {label}
    </button>
  );
}

function LockedVeil({ post, onSubscribe, onUnlock, signedIn, compact = false }: { post: Post; onSubscribe: () => void; onUnlock: () => void; signedIn: boolean; compact?: boolean }) {
  const ppv = post.access === "ppv";
  return (
    <div className={`locked-veil relative mx-4 my-3 flex flex-col items-center justify-center overflow-hidden rounded-[10px] border border-line px-6 text-center ${compact ? "py-8" : "aspect-[4/3]"}`}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/80 text-ink-2 shadow-[var(--shadow-card)]">
        <Icon name="lock" size={26} />
      </span>
      <p className="mt-3 text-[14px] text-ink-2">{ppv ? `Pay-per-view · ${fmtOnly(post.price)}` : `Subscribers only`}</p>
      {ppv ? (
        <button type="button" className="btn btn-accent mt-4" onClick={onUnlock}>
          <Icon name="unlock" size={16} /> Unlock for {fmtOnly(post.price)}
        </button>
      ) : (
        <button type="button" className="btn btn-accent mt-4" onClick={onSubscribe}>
          Subscribe to see {displayName(post.creator).split(" ")[0]}&apos;s posts
        </button>
      )}
      {!signedIn && <p className="mt-2 text-[12px] text-ink-3">You will be asked to sign in first.</p>}
      {post.mediaCount > 0 && (
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-ink-2">
          <Icon name="image" size={12} /> {post.mediaCount}
        </span>
      )}
    </div>
  );
}
