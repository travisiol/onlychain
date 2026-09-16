import { requireSession } from "@/lib/server/auth";
import { handle, json, readJson, ServiceError, str } from "@/lib/server/http";
import { getMedia, getProfile, handleTaken, updateProfile } from "@/lib/server/store";
import { HANDLE_RE, RESERVED_HANDLES } from "@/lib/site";

/** Read / edit your own profile. Becoming a creator needs a handle and a display name. */
export async function GET() {
  return handle(async () => {
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    return json({ profile: getProfile(auth.session.address) });
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const me = auth.session.address;
    const body = await readJson(req);
    const patch: Parameters<typeof updateProfile>[1] = {};

    if (body.handle !== undefined) {
      const handle = str(body.handle, 40).trim().toLowerCase().replace(/^@/, "");
      if (handle === "") patch.handle = null;
      else {
        if (!HANDLE_RE.test(handle)) throw new ServiceError("Handles are 3–24 characters: letters, numbers, dots and underscores.");
        if (RESERVED_HANDLES.has(handle)) throw new ServiceError("That handle is reserved.");
        if (handleTaken(handle, me)) throw new ServiceError("That handle is taken.");
        patch.handle = handle;
      }
    }
    if (body.displayName !== undefined) patch.displayName = str(body.displayName, 40).trim();
    if (body.bio !== undefined) patch.bio = str(body.bio, 600).trim();
    if (body.category !== undefined) patch.category = str(body.category, 30).trim();
    if (body.welcomeMessage !== undefined) patch.welcomeMessage = str(body.welcomeMessage, 1000).trim();
    if (body.hue !== undefined) patch.hue = Math.max(0, Math.min(359, Number(body.hue) || 0));
    for (const key of ["avatarMedia", "coverMedia"] as const) {
      if (body[key] === undefined) continue;
      if (body[key] === null || body[key] === "") patch[key] = null;
      else {
        const media = getMedia(String(body[key]));
        if (!media || media.owner !== me) throw new ServiceError("That upload is not yours.");
        if (!media.mime.startsWith("image/")) throw new ServiceError("Avatars and covers must be images.");
        patch[key] = media.id;
      }
    }
    if (body.isCreator !== undefined) {
      const wants = Boolean(body.isCreator);
      const after = { ...getProfile(me)!, ...patch };
      if (wants && (!after.handle || !after.displayName)) throw new ServiceError("Pick a handle and a display name to become a creator.");
      patch.isCreator = wants;
    }
    const profile = updateProfile(me, patch);
    return json({ profile });
  });
}
