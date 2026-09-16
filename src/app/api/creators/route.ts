import { getSession } from "@/lib/server/auth";
import { exploreCreators } from "@/lib/server/creators";
import { handle, json } from "@/lib/server/http";
import { seedIfEmpty } from "@/lib/server/seed";
import { listCategories, listPublicPosts } from "@/lib/server/store";
import { postsForViewer } from "@/lib/server/view";

/** Explore: creators (searchable, by category), the category list and a few free posts. */
export async function GET(req: Request) {
  return handle(async () => {
    seedIfEmpty();
    const url = new URL(req.url);
    const session = await getSession();
    const viewer = session?.address ?? null;
    const q = url.searchParams.get("q")?.trim().slice(0, 40) || undefined;
    const category = url.searchParams.get("category")?.trim().slice(0, 40) || undefined;
    const withPosts = url.searchParams.get("posts") === "1";
    const creators = await exploreCreators({ q, category, viewer, limit: Number(url.searchParams.get("limit") ?? 60) || 60 });
    const posts = withPosts ? await postsForViewer(listPublicPosts(viewer, 12), viewer) : [];
    return json({ creators, categories: listCategories(), posts });
  });
}
