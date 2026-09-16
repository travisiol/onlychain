import { requireSession } from "@/lib/server/auth";
import { earnedOf, planOf } from "@/lib/server/chainReads";
import { activeSubscribers } from "@/lib/server/creators";
import { handle, json } from "@/lib/server/http";
import { seedIfEmpty } from "@/lib/server/seed";
import { creatorStats, eventsForCreator, getProfile, getProfiles, listPostsByCreator, summaryOf } from "@/lib/server/store";
import { syncRecent } from "@/lib/server/sync";
import { postsForViewer } from "@/lib/server/view";

/** The creator dashboard: what the chain says you earned, who is subscribed, your posts, recent activity. */
export async function GET() {
  return handle(async () => {
    seedIfEmpty();
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const me = auth.session.address;
    await syncRecent();

    const [profile, plan, earned, subs, posts] = await Promise.all([
      Promise.resolve(getProfile(me)),
      planOf(me),
      earnedOf(me),
      activeSubscribers(me),
      postsForViewer(listPostsByCreator(me, me, { limit: 50, includeScheduled: true }), me),
    ]);
    const events = eventsForCreator(me, 40);
    const actors = getProfiles(events.map((e) => e.fan));
    // statements: one line per calendar month, from every payment the chain recorded for this creator
    const months = new Map<string, { month: string; gross: bigint; fee: bigint; net: bigint; subscriptions: number; tips: number; unlocks: number }>();
    for (const e of eventsForCreator(me, 5000)) {
      const month = new Date(e.ts).toISOString().slice(0, 7);
      const m = months.get(month) ?? { month, gross: 0n, fee: 0n, net: 0n, subscriptions: 0, tips: 0, unlocks: 0 };
      m.gross += BigInt(e.amount);
      m.fee += BigInt(e.fee);
      m.net += BigInt(e.amount) - BigInt(e.fee);
      if (e.kind === "subscribed") m.subscriptions++;
      else if (e.kind === "tipped") m.tips++;
      else if (e.kind === "unlocked") m.unlocks++;
      months.set(month, m);
    }
    const fans = getProfiles(subs.fans.map((f) => f.address));
    const thirtyDays = Date.now() - 30 * 86_400_000;
    const last30 = events.filter((e) => e.ts >= thirtyDays).reduce((acc, e) => acc + BigInt(e.amount) - BigInt(e.fee), 0n);

    return json({
      profile,
      plan,
      earned: earned.toString(),
      earnedLast30: last30.toString(),
      stats: { ...creatorStats(me), subscribers: subs.count },
      subscribers: subs.fans.map((f) => ({ ...summaryOf(f.address, fans), until: f.until })),
      posts,
      activity: events.map((e) => ({ ...e, fanProfile: summaryOf(e.fan, actors) })),
      statements: [...months.values()].sort((a, b) => (a.month < b.month ? 1 : -1)).map((m) => ({ ...m, gross: m.gross.toString(), fee: m.fee.toString(), net: m.net.toString() })),
    });
  });
}
