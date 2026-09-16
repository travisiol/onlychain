import { requireSession } from "@/lib/server/auth";
import { handle, json, rateLimit, readJson, ServiceError, str } from "@/lib/server/http";
import { getPost, insertComment, isBlocked, newId } from "@/lib/server/store";
import { canViewPost, commentsForViewer } from "@/lib/server/view";

/** Comment on a post you can see. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const { id } = await ctx.params;
    const me = auth.session.address;
    const row = getPost(id, me);
    if (!row) return json({ error: "No such post." }, { status: 404 });
    if (!(await canViewPost(row, me))) return json({ error: "Unlock the post first." }, { status: 403 });
    if (isBlocked(row.creator, me)) return json({ error: "This creator has blocked you." }, { status: 403 });
    rateLimit(`comment:${me}`, 60, 10 * 60_000);
    const body = await readJson(req);
    const text = str(body.text, 1000).trim();
    if (!text) throw new ServiceError("Write something.");
    const inserted = insertComment({ id: newId(), postId: id, address: me, text });
    const [comment] = commentsForViewer([inserted]);
    return json({ comment }, { status: 201 });
  });
}
