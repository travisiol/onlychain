import { requireSession } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { deleteComment, getComment, getPost } from "@/lib/server/store";

/** Remove a comment: its author, or the creator whose post it is on. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const { id } = await ctx.params;
    const me = auth.session.address;
    const c = getComment(id);
    if (!c) return json({ error: "No such comment." }, { status: 404 });
    const post = getPost(c.post_id, me);
    if (c.address !== me && post?.creator !== me) return json({ error: "Not yours to remove." }, { status: 403 });
    deleteComment(id);
    return json({ ok: true });
  });
}
