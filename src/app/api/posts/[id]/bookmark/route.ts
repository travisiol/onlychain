import { requireSession } from "@/lib/server/auth";
import { handle, json, readJson } from "@/lib/server/http";
import { getPost, setBookmark } from "@/lib/server/store";

/** Save / unsave a post to your collections (locked posts too — the veil is what gets saved). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const { id } = await ctx.params;
    const me = auth.session.address;
    const row = getPost(id, me);
    if (!row) return json({ error: "No such post." }, { status: 404 });
    const body = await readJson(req);
    const on = body.on === undefined ? row.bookmarked === 0 : Boolean(body.on);
    setBookmark(id, me, on);
    return json({ bookmarked: on });
  });
}
