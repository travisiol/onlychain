import { requireSession } from "@/lib/server/auth";
import { handle, json, rateLimit, readJson, ServiceError, str, wei } from "@/lib/server/http";
import { getMedia, getPost, getProfile, insertPost, newId } from "@/lib/server/store";
import { postsForViewer } from "@/lib/server/view";
import type { PostAccess } from "@/lib/model";

const ACCESS: PostAccess[] = ["free", "subscribers", "ppv"];

/** Create a post. Text and/or up to 10 files; access free / subscribers / ppv (price in wei); optional `publishAt` (ms) to schedule it. */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const me = auth.session.address;
    const profile = getProfile(me);
    if (!profile?.isCreator) throw new ServiceError("Set up your creator page in Studio before posting.", 403);
    if (profile.suspended) throw new ServiceError("This page has been suspended by the operator.", 403);
    rateLimit(`post:${me}`, 60, 60 * 60_000);

    const body = await readJson(req);
    const text = str(body.text, 4000).trim();
    const raw = Array.isArray(body.mediaIds) ? body.mediaIds : typeof body.mediaId === "string" && body.mediaId ? [body.mediaId] : [];
    const mediaIds = [...new Set(raw.filter((m): m is string => typeof m === "string" && m.length > 0))].slice(0, 10);
    const access = ACCESS.includes(body.access as PostAccess) ? (body.access as PostAccess) : "free";
    const price = access === "ppv" ? wei(body.price, "price") : "0";
    if (access === "ppv" && BigInt(price) === 0n) throw new ServiceError("A pay-per-view post needs a price.");
    if (!text && mediaIds.length === 0) throw new ServiceError("Write something or attach a file.");
    for (const mediaId of mediaIds) {
      const media = getMedia(mediaId);
      if (!media || media.owner !== me) throw new ServiceError("That upload is not yours.");
    }
    let createdAt = Date.now();
    if (body.publishAt !== undefined && body.publishAt !== null && body.publishAt !== "") {
      const at = Number(body.publishAt);
      if (!Number.isFinite(at)) throw new ServiceError("Bad publish time.");
      if (at > Date.now() + 90 * 86_400_000) throw new ServiceError("Schedule at most 90 days ahead.");
      if (at > Date.now()) createdAt = Math.floor(at);
    }
    const id = newId();
    insertPost({ id, creator: me, text, mediaIds, access, price, createdAt });
    const [post] = await postsForViewer([getPost(id, me)!], me);
    return json({ post }, { status: 201 });
  });
}
