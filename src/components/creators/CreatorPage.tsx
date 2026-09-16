"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Usd } from "@/components/Usd";
import { SubscribeDialog, TipDialog } from "@/components/pay/PayDialogs";
import { PostCard } from "@/components/posts/PostCard";
import { useSession } from "@/components/session";
import { ColumnHeader } from "@/components/shell/AppShell";
import { api } from "@/lib/client/api";
import { useNow } from "@/lib/client/now";
import { compact, daysLeft, displayName, fmtDate, fmtOnly, handleOf } from "@/lib/format";
import { site } from "@/lib/site";
import type { CreatorStats, Plan, Post, Profile } from "@/lib/model";

type CreatorData = { profile: Profile; plan: Plan; stats: CreatorStats; viewerUntil: number; viewerTrial: boolean; isOwner: boolean; posts: Post[]; nextBefore: number | null };

/**
 * The creator page as the reference lays it out: cover, avatar over its
 * lower edge, name and handle, bio, the subscription block, then the
 * Posts / Media tabs. Public — locked posts show their veil.
 */
export function CreatorPage({ refKey }: { refKey: string }) {
  const { session } = useSession();
  const qc = useQueryClient();
  const now = useNow();
  const [tab, setTab] = useState<"posts" | "media">("posts");
  const [dialog, setDialog] = useState<null | "subscribe" | "tip">(null);
  const [bioOpen, setBioOpen] = useState(false);

  const data = useQuery({
    queryKey: ["creator", refKey, tab, session?.address ?? "anon"],
    queryFn: () => api<CreatorData>(`/api/creators/${encodeURIComponent(refKey)}${tab === "media" ? "?media=1" : ""}`),
  });

  if (data.isPending) {
    return (
      <>
        <ColumnHeader title="…" back />
        <div className="animate-pulse">
          <div className="h-[180px] bg-bg-3" />
          <div className="px-4 pt-14">
            <div className="h-5 w-40 rounded bg-bg-3" />
          </div>
        </div>
      </>
    );
  }
  if (data.isError || !data.data) return <p className="p-6 text-danger">{(data.error as Error)?.message ?? "Not found."}</p>;

  const { profile, plan, stats, viewerUntil, viewerTrial, isOwner, posts } = data.data;
  const subscribed = now > 0 && viewerUntil * 1000 > now;
  const price = plan ? BigInt(plan.monthlyPrice) : null;
  const paidPage = price !== null && price > 0n;

  return (
    <>
      <ColumnHeader title={displayName(profile)} back sub={`${stats.posts} ${stats.posts === 1 ? "post" : "posts"} · ${compact(stats.likes)} ${stats.likes === 1 ? "like" : "likes"}`} />

      {/* cover + avatar */}
      <div className="relative">
        <div className="h-[180px] w-full overflow-hidden bg-bg-3 sm:h-[220px]">
          {profile.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full brand-gradient" />
          )}
        </div>
        <div className="absolute -bottom-12 left-4">
          <Avatar profile={profile} size={100} ring />
        </div>
        <div className="absolute right-4 top-full mt-3 flex items-center gap-2">
          {isOwner ? (
            <>
              <Link href="/settings" className="btn btn-ghost btn-sm">
                Edit profile
              </Link>
              <Link href="/studio" className="btn btn-outline btn-sm">
                Studio
              </Link>
            </>
          ) : (
            <>
              {session && (
                <Link href={`/messages/${profile.handle ?? profile.address}`} className="icon-btn border border-line-2" aria-label="Message" title="Message">
                  <Icon name="message" size={20} />
                </Link>
              )}
              <button type="button" className="icon-btn border border-line-2" aria-label="Send a tip" title="Send a tip" onClick={() => setDialog("tip")}>
                <Icon name="coin" size={20} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="px-4 pt-14">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[19px] font-bold leading-tight">{displayName(profile)}</h2>
          {profile.verified && <Icon name="verified" size={18} className="text-accent" />}
          {profile.sample && <span className="ml-1 rounded-full bg-bg-3 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-2">Sample</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-[14px] text-ink-2">
          <span>{handleOf(profile)}</span>
          {profile.category && (
            <>
              <span aria-hidden="true">·</span>
              <Link href={`/explore?category=${encodeURIComponent(profile.category)}`} className="hover:underline">
                {profile.category}
              </Link>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span className="mono text-[12px]">{profile.address.slice(0, 6)}…{profile.address.slice(-4)}</span>
        </div>

        {profile.bio && (
          <p className={`mt-3 text-[15px] leading-[1.5] ${bioOpen ? "" : "truncate-2"}`} onClick={() => setBioOpen((v) => !v)}>
            {profile.bio}
          </p>
        )}
        {profile.bio && profile.bio.length > 120 && (
          <button type="button" className="mt-1 text-[13px] font-medium text-accent" onClick={() => setBioOpen((v) => !v)}>
            {bioOpen ? "Less info" : "More info"}
          </button>
        )}

        <dl className="mt-3 flex gap-5 text-[13px] text-ink-2">
          <div>
            <b className="text-ink">{stats.posts}</b> {stats.posts === 1 ? "post" : "posts"}
          </div>
          <div>
            <b className="text-ink">{stats.media}</b> media
          </div>
          <div>
            <b className="text-ink">{compact(stats.likes)}</b> {stats.likes === 1 ? "like" : "likes"}
          </div>
          <div>
            <b className="text-ink">{stats.subscribers}</b> {stats.subscribers === 1 ? "subscriber" : "subscribers"}
          </div>
        </dl>

        {/* subscription block */}
        {!isOwner && (
          <section className="mt-5">
            <h3 className="eyebrow">Subscription</h3>
            {plan === null ? (
              <p className="mt-2 text-[14px] text-ink-2">This wallet has not opened a subscription plan yet.</p>
            ) : subscribed ? (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex flex-1 items-center justify-between rounded-full border border-accent bg-accent-soft px-5 py-2.5 text-[13px] font-semibold uppercase tracking-[0.04em] text-accent-ink">
                  <span className="inline-flex items-center gap-2">
                    <Icon name="check" size={16} /> Subscribed
                  </span>
                  <span className="font-medium normal-case tracking-normal">
                    until {fmtDate(viewerUntil)} · {daysLeft(viewerUntil, now || viewerUntil * 1000)} days left
                  </span>
                </div>
                {plan.open && (
                  <button type="button" className="btn btn-outline" onClick={() => setDialog("subscribe")}>
                    Extend
                  </button>
                )}
              </div>
            ) : (
              <button type="button" className="btn btn-accent mt-2 w-full justify-between px-5" onClick={() => setDialog("subscribe")} disabled={!plan.open}>
                <span>{plan.open ? (viewerTrial && plan.trialDays > 0 ? `Free for ${plan.trialDays} days` : "Subscribe") : "Not accepting subscribers"}</span>
                {plan.open && (
                  <span className="normal-case tracking-normal">
                    {paidPage ? `${fmtOnly(price!)} / month` : "Free"} {paidPage && <Usd wei={price} className="text-white/80" />}
                  </span>
                )}
              </button>
            )}
            {plan?.open && !subscribed && paidPage && (
              <p className="mt-2 text-[12px] text-ink-3">
                1, 3, 6 or 12 months{plan.discount3Bps || plan.discount6Bps || plan.discount12Bps ? ` — bundles up to −${Math.max(plan.discount3Bps, plan.discount6Bps, plan.discount12Bps) / 100}%` : ""}. Paid wallet to wallet in ${site.token.symbol}; {100 - site.feeBps / 100}% goes to {displayName(profile).split(" ")[0]}. No auto-renewal.
              </p>
            )}
          </section>
        )}
      </div>

      {/* tabs */}
      <div className="mt-5 flex border-b border-line px-2">
        <button type="button" className={`tab ${tab === "posts" ? "is-active" : ""}`} onClick={() => setTab("posts")}>
          {stats.posts} {stats.posts === 1 ? "Post" : "Posts"}
        </button>
        <button type="button" className={`tab ${tab === "media" ? "is-active" : ""}`} onClick={() => setTab("media")}>
          {stats.media} Media
        </button>
      </div>

      {posts.length === 0 && <p className="p-8 text-center text-[14px] text-ink-2">No posts yet.</p>}
      {posts.map((p) => (
        <PostCard key={p.id} post={p} onChange={() => data.refetch()} />
      ))}

      <SubscribeDialog open={dialog === "subscribe"} onClose={() => setDialog(null)} creator={profile} plan={plan} currentUntil={viewerUntil} trialAvailable={viewerTrial} onPaid={() => qc.invalidateQueries()} />
      <TipDialog open={dialog === "tip"} onClose={() => setDialog(null)} creator={profile} />
    </>
  );
}
