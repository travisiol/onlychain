import { getSession } from "@/lib/server/auth";
import { getMedia, mayRead, streamMedia } from "@/lib/server/media";
import { seedIfEmpty } from "@/lib/server/seed";

/** Every image and video on the site. Access is decided by what the file is attached to. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  seedIfEmpty();
  const { id } = await ctx.params;
  const media = getMedia(id);
  if (!media) return new Response("Not found", { status: 404 });
  const session = await getSession();
  if (!(await mayRead(media, session?.address ?? null))) return new Response("Locked", { status: 403, headers: { "cache-control": "no-store" } });
  return streamMedia(media, req);
}
