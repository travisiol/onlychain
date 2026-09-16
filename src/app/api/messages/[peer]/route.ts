import { getAddress } from "viem";
import { requireSession } from "@/lib/server/auth";
import { handle, json, rateLimit, readJson, ServiceError, str, wei } from "@/lib/server/http";
import { seedIfEmpty } from "@/lib/server/seed";
import { getMedia, getProfile, insertMessage, isBlocked, listThread, markThreadRead, newId, resolveProfile, summaryOf } from "@/lib/server/store";
import { messagesForViewer } from "@/lib/server/view";

/**
 * One thread. Anyone signed in can write to a creator; a creator can write
 * to anyone who wrote first (or to a subscriber — the chain is not asked
 * here, the reply itself is the invitation). Creators may attach a price to
 * a file: a pay-per-view message, unlocked with the same `unlock` call as a
 * post.
 */
function canWrite(me: string, peer: string): boolean {
  const mine = getProfile(me);
  const theirs = getProfile(peer);
  if (theirs?.isCreator) return true;
  if (mine?.isCreator) return true;
  return listThread(me, peer, 1).length > 0;
}

export async function GET(_req: Request, ctx: { params: Promise<{ peer: string }> }) {
  return handle(async () => {
    seedIfEmpty();
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const me = auth.session.address;
    const { peer } = await ctx.params;
    const profile = resolveProfile(decodeURIComponent(peer));
    if (!profile) return json({ error: "No such wallet." }, { status: 404 });
    if (profile.address === me) return json({ error: "That is you." }, { status: 400 });
    markThreadRead(me, profile.address);
    const messages = await messagesForViewer(listThread(me, profile.address), me);
    return json({ peer: summaryOf(profile.address), messages, canWrite: canWrite(me, profile.address) && !isBlocked(profile.address, me), iAmCreator: Boolean(getProfile(me)?.isCreator), blockedByMe: isBlocked(me, profile.address) });
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ peer: string }> }) {
  return handle(async () => {
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const me = auth.session.address;
    const { peer } = await ctx.params;
    const profile = resolveProfile(decodeURIComponent(peer));
    if (!profile) return json({ error: "No such wallet." }, { status: 404 });
    if (getAddress(profile.address) === me) throw new ServiceError("You cannot message yourself.");
    rateLimit(`dm:${me}`, 120, 10 * 60_000);
    if (getProfile(me)?.suspended) throw new ServiceError("This wallet has been suspended by the operator.", 403);
    if (!canWrite(me, profile.address)) throw new ServiceError("This wallet only receives messages from creators it talks to.", 403);
    if (isBlocked(profile.address, me)) throw new ServiceError("This wallet has blocked you.", 403);

    const body = await readJson(req);
    const text = str(body.text, 2000).trim();
    const mediaId = typeof body.mediaId === "string" && body.mediaId ? body.mediaId : null;
    let price = "0";
    if (body.price !== undefined && body.price !== null && body.price !== "" && body.price !== "0") {
      if (!getProfile(me)?.isCreator) throw new ServiceError("Only creators can send paid messages.", 403);
      if (!mediaId) throw new ServiceError("A paid message needs a file attached.");
      price = wei(body.price, "price");
    }
    if (!text && !mediaId) throw new ServiceError("Write something or attach a file.");
    if (mediaId) {
      const media = getMedia(mediaId);
      if (!media || media.owner !== me) throw new ServiceError("That upload is not yours.");
    }
    const row = insertMessage({ id: newId(), sender: me, recipient: profile.address, text, mediaId, price });
    const [message] = await messagesForViewer([row], me);
    return json({ message }, { status: 201 });
  });
}
