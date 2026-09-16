import { getAddress } from "viem";
import { requireSession } from "@/lib/server/auth";
import { subscriptionsOf } from "@/lib/server/chainReads";
import { creatorCards } from "@/lib/server/creators";
import { handle, json } from "@/lib/server/http";
import { seedIfEmpty } from "@/lib/server/seed";
import { listCreators, listFeed, subscribedCreators } from "@/lib/server/store";
import { syncRecent } from "@/lib/server/sync";
import { postsForViewer } from "@/lib/server/view";

/**
 * Home: posts from the creators the viewer is subscribed to *right now*
 * (the chain decides), plus their own. The candidates come from indexed
 * Subscribed events; each is checked against `subscribedUntil`.
 */
export async function GET(req: Request) {
  return handle(async () => {
    seedIfEmpty();
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const me = auth.session.address;
    await syncRecent();

    const url = new URL(req.url);
    const before = Number(url.searchParams.get("before")) || undefined;
    const candidates = subscribedCreators(me);
    const untils = await subscriptionsOf(me, candidates);
    const now = Math.floor(Date.now() / 1000);
    const active = candidates.filter((c) => (untils.get(getAddress(c)) ?? 0) > now);
    const sources = [...new Set([...active, me])];
    const posts = await postsForViewer(listFeed(sources, me, { before, limit: 20 }), me);

    const following = new Set(active.map((a) => a.toLowerCase()));
    const suggestions = await creatorCards(
      listCreators({ exclude: me, limit: 30 }).filter((p) => !following.has(p.address.toLowerCase())).slice(0, 8),
      me,
    );
    return json({ posts, following: active.length, suggestions, nextBefore: posts.length === 20 ? posts[posts.length - 1].createdAt : null });
  });
}
