import "server-only";
import { getAddress } from "viem";
import { plansOf, subscribersOf, subscriptionsOf } from "@/lib/server/chainReads";
import { creatorStats, listCreators, subscriberCandidates, type ProfileRow } from "@/lib/server/store";
import type { Plan, Profile } from "@/lib/model";

/** A creator as the Explore grid and the right rail show it: profile + plan + counts + the viewer's own subscription end. */
export type CreatorCard = Profile & {
  plan: Plan;
  stats: { posts: number; media: number; likes: number };
  /** Unix seconds the viewer's subscription runs until (0 = none). */
  viewerUntil: number;
};

export async function creatorCards(profiles: Profile[], viewer: string | null): Promise<CreatorCard[]> {
  const addresses = profiles.map((p) => p.address);
  const [plans, subs] = await Promise.all([plansOf(addresses), viewer ? subscriptionsOf(viewer, addresses) : Promise.resolve(new Map<string, number>())]);
  return profiles.map((p) => ({
    ...p,
    plan: plans.get(getAddress(p.address)) ?? null,
    stats: creatorStats(p.address),
    viewerUntil: subs.get(getAddress(p.address)) ?? 0,
  }));
}

export async function exploreCreators(opts: { q?: string; category?: string; viewer: string | null; limit?: number }): Promise<CreatorCard[]> {
  const profiles = listCreators({ q: opts.q, category: opts.category, limit: opts.limit, exclude: opts.viewer ?? undefined });
  return creatorCards(profiles, opts.viewer);
}

/** Active subscriber count, verified against the chain for every wallet that ever subscribed. */
export async function activeSubscribers(creator: string): Promise<{ count: number; fans: { address: string; until: number }[] }> {
  const candidates = subscriberCandidates(creator);
  if (candidates.length === 0) return { count: 0, fans: [] };
  const untils = await subscribersOf(creator, candidates);
  const now = Math.floor(Date.now() / 1000);
  const fans = [...untils.entries()].filter(([, until]) => until > now).map(([address, until]) => ({ address, until }));
  return { count: fans.length, fans };
}

export type { ProfileRow };
