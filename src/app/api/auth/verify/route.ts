import { setSession, verifySignIn } from "@/lib/server/auth";
import { handle, json, readJson } from "@/lib/server/http";
import { getProfile } from "@/lib/server/store";

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const result = await verifySignIn({
      address: String(body.address ?? ""),
      nonce: String(body.nonce ?? ""),
      issuedAt: String(body.issuedAt ?? ""),
      signature: String(body.signature ?? ""),
    });
    if (!result.ok) return json({ error: result.reason }, { status: 401 });
    const session = await setSession(result.address);
    return json({ session, profile: getProfile(result.address) });
  });
}
