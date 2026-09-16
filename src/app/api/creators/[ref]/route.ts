import { getSession, isOps } from "@/lib/server/auth";
import { planOf, subscribedUntil, trialAvailable } from "@/lib/server/chainReads";
import { activeSubscribers } from "@/lib/server/creators";
import { handle, json } from "@/lib/server/http";
import { seedIfEmpty } from "@/lib/server/seed";
import { creatorStats, listPostsByCreator, resolveProfile } from "@/lib/server/store";
import { syncRecent } from "@/lib/server/sync";
import { postsForViewer } from "@/lib/server/view";

/** A creator page: profile, plan (chain), counts, the viewer's subscription end, and the first page of posts. */
export async function GET(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  return handle(async () => {
    seedIfEmpty();
    const { ref } = await ctx.params;
    const profile = resolveProfile(decodeURIComponent(ref));
    if (!profile) return json({ error: "No such creator." }, { status: 404 });
    const url = new URL(req.url);
    const session = await getSession();
    const viewer = session?.address ?? null;
    if (profile.suspended && viewer !== profile.address && !(viewer && isOps(viewer))) return json({ error: "This page is unavailable." }, { status: 404 });
    const mediaOnly = url.searchParams.get("media") === "1";
    const before = Number(url.searchParams.get("before")) || undefined;
    await syncRecent();
    const [plan, until, trial, subs, posts] = await Promise.all([
      planOf(profile.address),
      viewer ? subscribedUntil(profile.address, viewer) : Promise.resolve(0),
      viewer ? trialAvailable(profile.address, viewer) : Promise.resolve(false),
      activeSubscribers(profile.address),
      postsForViewer(listPostsByCreator(profile.address, viewer, { before, limit: 20, mediaOnly }), viewer),
    ]);
    return json({
      profile,
      plan,
      stats: { ...creatorStats(profile.address), subscribers: subs.count },
      viewerUntil: until === Number.MAX_SAFE_INTEGER ? 0 : until,
      viewerTrial: trial,
      isOwner: viewer !== null && viewer === profile.address,
      posts,
      nextBefore: posts.length === 20 ? posts[posts.length - 1].createdAt : null,
    });
  });
}
