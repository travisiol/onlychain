import { requireSession } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { seedIfEmpty } from "@/lib/server/seed";
import { eventsForCreator, getProfiles, getSeen, setSeen, socialForCreator, summaryOf } from "@/lib/server/store";
import { syncRecent } from "@/lib/server/sync";
import type { Notification } from "@/lib/model";

/**
 * What happened to you: payments received (from the chain) and likes /
 * comments on your posts (from the site). GET lists and marks as seen;
 * `?peek=1` only counts what is new.
 */
export async function GET(req: Request) {
  return handle(async () => {
    seedIfEmpty();
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const me = auth.session.address;
    const peek = new URL(req.url).searchParams.get("peek") === "1";
    await syncRecent();

    const events = eventsForCreator(me, 60);
    const social = socialForCreator(me, 60);
    const actors = getProfiles([...events.map((e) => e.fan), ...social.map((s) => s.address)]);

    const list: Notification[] = [
      ...events.map<Notification>((e) => ({
        id: e.id,
        kind: e.kind === "subscribed" ? ((e.extra.months as number) > 0 && (e.extra.renewed as boolean) ? "renewed" : "subscribed") : e.kind === "tipped" ? "tipped" : "unlocked",
        actor: summaryOf(e.fan, actors),
        amount: e.amount,
        postId: null,
        text: e.kind === "subscribed" ? (Number(e.extra.months) === 0 ? "a free trial" : `${e.extra.months} month${Number(e.extra.months) > 1 ? "s" : ""}`) : null,
        createdAt: e.ts,
        txHash: e.txHash,
      })),
      ...social.map<Notification>((s) => ({
        id: s.id,
        kind: s.kind,
        actor: summaryOf(s.address, actors),
        amount: null,
        postId: s.post_id,
        text: s.text,
        createdAt: s.created_at,
        txHash: null,
      })),
    ]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 80);

    const seenAt = getSeen(me);
    const unseen = list.filter((n) => n.createdAt > seenAt).length;
    if (!peek && list.length) setSeen(me, Math.max(seenAt, list[0].createdAt));
    return json({ notifications: peek ? [] : list, unseen });
  });
}
