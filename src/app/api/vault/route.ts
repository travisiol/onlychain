import { requireSession } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { listVault, mediaUrl } from "@/lib/server/store";

/** Your uploads and where each one is used — the reference's Vault. */
export async function GET() {
  return handle(async () => {
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const rows = listVault(auth.session.address);
    return json({
      media: rows.map((m) => ({
        id: m.id,
        url: mediaUrl(m.id),
        mime: m.mime,
        kind: m.mime.startsWith("video/") ? "video" : "image",
        bytes: m.bytes,
        createdAt: m.created_at,
        usedInPosts: m.used_in_posts,
        usedInMessages: m.used_in_messages,
        isAvatar: m.is_avatar > 0,
        isCover: m.is_cover > 0,
      })),
    });
  });
}
