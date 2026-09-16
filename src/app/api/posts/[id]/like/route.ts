import { requireSession } from "@/lib/server/auth";
import { handle, json, readJson } from "@/lib/server/http";
import { getPost, setLike } from "@/lib/server/store";
import { canViewPost } from "@/lib/server/view";

/** Like / unlike. You can like what you can see. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const { id } = await ctx.params;
    const me = auth.session.address;
    const row = getPost(id, me);
    if (!row) return json({ error: "No such post." }, { status: 404 });
    if (!(await canViewPost(row, me))) return json({ error: "Unlock the post first." }, { status: 403 });
    const body = await readJson(req);
    const on = body.on === undefined ? row.liked === 0 : Boolean(body.on);
    setLike(id, me, on);
    const after = getPost(id, me)!;
    return json({ liked: after.liked > 0, likes: after.likes });
  });
}
