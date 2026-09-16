import { requireSession } from "@/lib/server/auth";
import { activeSubscribers } from "@/lib/server/creators";
import { handle, json, rateLimit, readJson, ServiceError, str, wei } from "@/lib/server/http";
import { getMedia, getProfile, insertMessage, isBlocked, newId } from "@/lib/server/store";

/**
 * A creator writes to every active subscriber at once (the reference's mass
 * message). Each gets their own message row; a priced file is unlocked by
 * each fan separately, in their own thread.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const me = auth.session.address;
    if (!getProfile(me)?.isCreator) throw new ServiceError("Only creators can message their subscribers.", 403);
    rateLimit(`broadcast:${me}`, 6, 60 * 60_000);
    const body = await readJson(req);
    const text = str(body.text, 2000).trim();
    const mediaId = typeof body.mediaId === "string" && body.mediaId ? body.mediaId : null;
    let price = "0";
    if (body.price !== undefined && body.price !== null && body.price !== "" && body.price !== "0") {
      if (!mediaId) throw new ServiceError("A paid message needs a file attached.");
      price = wei(body.price, "price");
    }
    if (!text && !mediaId) throw new ServiceError("Write something or attach a file.");
    if (mediaId) {
      const media = getMedia(mediaId);
      if (!media || media.owner !== me) throw new ServiceError("That upload is not yours.");
    }
    const { fans } = await activeSubscribers(me);
    const recipients = fans.map((f) => f.address).filter((a) => !isBlocked(me, a));
    for (const to of recipients) insertMessage({ id: newId(), sender: me, recipient: to, text, mediaId, price });
    return json({ sent: recipients.length }, { status: 201 });
  });
}
