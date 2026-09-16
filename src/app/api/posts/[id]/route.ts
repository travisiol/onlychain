import { getSession, requireSession } from "@/lib/server/auth";
import { handle, json, readJson, ServiceError, str } from "@/lib/server/http";
import { seedIfEmpty } from "@/lib/server/seed";
import { deletePost, getPost, listComments, updatePost } from "@/lib/server/store";
import { commentsForViewer, postsForViewer } from "@/lib/server/view";

/** One post with its comments. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    seedIfEmpty();
    const { id } = await ctx.params;
    const session = await getSession();
    const viewer = session?.address ?? null;
    const row = getPost(id, viewer);
    if (!row) return json({ error: "No such post." }, { status: 404 });
    const [post] = await postsForViewer([row], viewer);
    return json({ post, comments: commentsForViewer(listComments(id)) });
  });
}

/** Edit your own post: the text, or pin / unpin it on your page. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const { id } = await ctx.params;
    const me = auth.session.address;
    const body = await readJson(req);
    const patch: { text?: string; pinned?: boolean } = {};
    if (body.text !== undefined) {
      patch.text = str(body.text, 4000).trim();
      const row = getPost(id, me);
      if (row && !patch.text && row.media_count === 0) throw new ServiceError("A post needs text or a file.");
    }
    if (body.pinned !== undefined) patch.pinned = Boolean(body.pinned);
    if (!updatePost(id, me, patch)) return json({ error: "Not your post, or nothing to change." }, { status: 404 });
    const [post] = await postsForViewer([getPost(id, me)!], me);
    return json({ post });
  });
}

/** Delete your own post (soft — the row stays, the page forgets it). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const { id } = await ctx.params;
    if (!deletePost(id, auth.session.address)) return json({ error: "Not your post, or already gone." }, { status: 404 });
    return json({ ok: true });
  });
}
