import { requireSession } from "@/lib/server/auth";
import { handle, json, rateLimit, readJson, ServiceError, str } from "@/lib/server/http";
import { getMessage, getPost, insertReport, resolveProfile } from "@/lib/server/store";

/** Flag a post, a profile or a message for the operator. Stored; there is no moderation screen yet (see README). */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    rateLimit(`report:${auth.session.address}`, 20, 60 * 60_000);
    const body = await readJson(req);
    const kind = body.kind === "post" || body.kind === "profile" || body.kind === "message" ? body.kind : null;
    const target = str(body.target, 120).trim();
    const reason = str(body.reason, 1000).trim();
    if (!kind || !target) throw new ServiceError("What are you reporting?");
    if (!reason) throw new ServiceError("Say what is wrong, in a few words.");
    const exists = kind === "post" ? getPost(target, null) : kind === "message" ? getMessage(target) : resolveProfile(target);
    if (!exists) throw new ServiceError("That does not exist.", 404);
    const id = insertReport({ reporter: auth.session.address, kind, target, reason });
    return json({ ok: true, id }, { status: 201 });
  });
}
