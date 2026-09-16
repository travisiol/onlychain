import { requireSession } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { seedIfEmpty } from "@/lib/server/seed";
import { listBookmarked } from "@/lib/server/store";
import { postsForViewer } from "@/lib/server/view";

/** The posts you saved, newest save first, with today's access applied. */
export async function GET() {
  return handle(async () => {
    seedIfEmpty();
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const me = auth.session.address;
    return json({ posts: await postsForViewer(listBookmarked(me), me) });
  });
}
