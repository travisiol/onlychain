import { requireSession } from "@/lib/server/auth";
import { handle, json, rateLimit, ServiceError } from "@/lib/server/http";
import { saveUpload } from "@/lib/server/media";
import { mediaUrl } from "@/lib/server/store";

/** Multipart upload, field `file`. Returns the media id to attach to a post, a message or the profile. */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    rateLimit(`upload:${auth.session.address}`, 60, 10 * 60_000);
    const form = await req.formData().catch(() => {
      throw new ServiceError("Expected a multipart form.");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw new ServiceError("No file in the form.");
    const media = await saveUpload(auth.session.address, file);
    return json({ media: { id: media.id, url: mediaUrl(media.id), mime: media.mime, bytes: media.bytes } });
  });
}
