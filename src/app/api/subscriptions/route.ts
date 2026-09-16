import { getAddress } from "viem";
import { requireSession } from "@/lib/server/auth";
import { plansOf, spentOf, subscriptionsOf } from "@/lib/server/chainReads";
import { handle, json } from "@/lib/server/http";
import { seedIfEmpty } from "@/lib/server/seed";
import { eventsForFan, getProfiles, subscribedCreators, summaryOf } from "@/lib/server/store";
import { syncRecent } from "@/lib/server/sync";
import type { Subscription } from "@/lib/model";

/** Everything the viewer ever subscribed to, active first, with the chain's end date; plus their payment history. */
export async function GET() {
  return handle(async () => {
    seedIfEmpty();
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const me = auth.session.address;
    await syncRecent();

    const creators = subscribedCreators(me);
    const [untils, plans, spent] = await Promise.all([subscriptionsOf(me, creators), plansOf(creators), spentOf(me)]);
    const profiles = getProfiles(creators);
    const now = Math.floor(Date.now() / 1000);
    const subscriptions: Subscription[] = creators
      .map((c) => {
        const addr = getAddress(c);
        const p = profiles.get(addr);
        const until = untils.get(addr) ?? 0;
        return {
          creator: { ...summaryOf(addr, profiles), category: p?.category ?? "", cover: p?.cover ?? null },
          until,
          active: until > now,
          plan: plans.get(addr) ?? null,
        };
      })
      .sort((a, b) => Number(b.active) - Number(a.active) || b.until - a.until);

    const history = eventsForFan(me, 100).filter((e) => e.kind !== "plan");
    const actors = getProfiles(history.map((e) => e.creator));
    return json({
      subscriptions,
      spent: spent.toString(),
      history: history.map((e) => ({ ...e, creatorProfile: summaryOf(e.creator, actors) })),
    });
  });
}
