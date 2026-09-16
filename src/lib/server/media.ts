import "server-only";
import { createReadStream, existsSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { getAddress } from "viem";
import { db, placement } from "@/lib/server/db";
import { ServiceError } from "@/lib/server/http";
import { getMedia, insertMedia, newId, type MediaRow } from "@/lib/server/store";
import { canViewMessage, canViewPost } from "@/lib/server/view";

/**
 * Files: where they are written and who may read them. Every media URL on
 * the site goes through /api/media/[id], which asks what the file is
 * attached to (an avatar, a post, a message) and applies that thing's rule.
 * A file attached to nothing is visible to its uploader only.
 */

export const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function saveUpload(owner: string, file: File): Promise<MediaRow> {
  const ext = ALLOWED_MIME[file.type];
  if (!ext) throw new ServiceError("Only JPEG, PNG, WebP, GIF, MP4 and WebM files are accepted.");
  if (file.size === 0) throw new ServiceError("The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new ServiceError("The file is larger than 25 MB.");
  const id = newId();
  const name = `${id}.${ext}`;
  await writeFile(/* turbopackIgnore: true */ join(placement().uploadDir, name), Buffer.from(await file.arrayBuffer()));
  return insertMedia({ id, owner: getAddress(owner), mime: file.type, path: name, width: null, height: null, bytes: file.size });
}

function resolvePath(m: MediaRow): string | null {
  if (m.path.startsWith("seed:")) {
    // sample media lives under public/seed (svg art, photos/…); never outside it
    const parts = m.path.slice(5).split(/[\/]/).filter(Boolean);
    if (parts.some((p) => p === ".." || p === ".")) return null;
    return join(process.cwd(), "public", "seed", ...parts);
  }
  return join(placement().uploadDir, basename(m.path));
}

type Attachment =
  | { kind: "profile" }
  | { kind: "post"; id: string; creator: string; access: "free" | "subscribers" | "ppv"; price: string }
  | { kind: "message"; id: string; sender: string; recipient: string; price: string }
  | { kind: "none" };

function attachmentOf(mediaId: string): Attachment {
  const d = db();
  const prof = d.prepare("SELECT address FROM profiles WHERE avatar_media = ? OR cover_media = ? LIMIT 1").get(mediaId, mediaId);
  if (prof) return { kind: "profile" };
  const post = d.prepare("SELECT p.id, p.creator, p.access, p.price FROM post_media pm JOIN posts p ON p.id = pm.post_id WHERE pm.media_id = ? AND p.deleted = 0 LIMIT 1").get(mediaId) as Attachment & { kind: "post" } | undefined;
  if (post) return { ...post, kind: "post" };
  const msg = d.prepare("SELECT id, sender, recipient, price FROM messages WHERE media_id = ? LIMIT 1").get(mediaId) as Attachment & { kind: "message" } | undefined;
  if (msg) return { ...msg, kind: "message" };
  return { kind: "none" };
}

export async function mayRead(m: MediaRow, viewer: string | null): Promise<boolean> {
  const att = attachmentOf(m.id);
  if (att.kind === "profile") return true;
  if (viewer && getAddress(viewer) === getAddress(m.owner)) return true;
  if (att.kind === "post") return canViewPost(att, viewer);
  if (att.kind === "message") {
    if (!viewer) return false;
    const v = getAddress(viewer);
    if (v !== getAddress(att.sender) && v !== getAddress(att.recipient)) return false;
    return canViewMessage(att, v);
  }
  return false;
}

export function streamMedia(m: MediaRow, req: Request): Response {
  const path = resolvePath(m);
  // Paths are computed at runtime (uploads dir, seed files): tell the bundler not to trace them; the seed folder is listed in next.config instead.
  if (!path || !existsSync(/* turbopackIgnore: true */ path)) return new Response("Gone", { status: 410 });
  const size = statSync(/* turbopackIgnore: true */ path).size;
  const range = req.headers.get("range");
  const headers: Record<string, string> = {
    "content-type": m.mime,
    "cache-control": "private, max-age=3600",
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
    "content-security-policy": "sandbox",
  };
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (start <= end && start < size) {
        headers["content-range"] = `bytes ${start}-${end}/${size}`;
        headers["content-length"] = String(end - start + 1);
        return new Response(Readable.toWeb(createReadStream(/* turbopackIgnore: true */ path, { start, end })) as ReadableStream, { status: 206, headers });
      }
    }
  }
  headers["content-length"] = String(size);
  return new Response(Readable.toWeb(createReadStream(/* turbopackIgnore: true */ path)) as ReadableStream, { status: 200, headers });
}

export { getMedia };
