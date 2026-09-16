"use client";

import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { useNow } from "@/lib/client/now";
import { displayName, fmtOnly, handleOf, profileHref } from "@/lib/format";
import type { Plan, Profile } from "@/lib/model";

export type CreatorCardData = Profile & { plan: Plan; stats?: { posts: number; media: number; likes: number }; viewerUntil?: number };

/** Cover with the avatar sitting on its lower edge, name and handle in white — the reference's suggestion tile. */
export function CreatorCard({ creator, compact = false }: { creator: CreatorCardData; compact?: boolean }) {
  const now = useNow();
  const price = creator.plan ? BigInt(creator.plan.monthlyPrice) : null;
  const subscribed = now > 0 && (creator.viewerUntil ?? 0) * 1000 > now;
  return (
    <Link href={profileHref(creator)} className={`group relative block overflow-hidden rounded-[10px] ${compact ? "h-[104px]" : "h-[150px]"}`}>
      {creator.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={creator.cover} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" draggable={false} />
      ) : (
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, hsl(${creator.hue} 60% 55%), hsl(${(creator.hue + 40) % 360} 60% 35%))` }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-3">
        <Avatar profile={creator} size={compact ? 44 : 56} ring />
        <div className="min-w-0 flex-1 pb-0.5 text-white">
          <div className="flex items-center gap-1">
            <span className="truncate text-[15px] font-semibold">{displayName(creator)}</span>
            {creator.verified && <Icon name="verified" size={16} className="shrink-0 text-accent" />}
          </div>
          <div className="truncate text-[13px] text-white/80">{handleOf(creator)}</div>
        </div>
        <span className="shrink-0 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-ink">
          {subscribed ? "Subscribed" : price === null ? "—" : price === 0n ? "Free" : `${fmtOnly(price, { symbol: false })} / mo`}
        </span>
      </div>
    </Link>
  );
}
