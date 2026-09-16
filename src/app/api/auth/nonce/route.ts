import { issueNonce } from "@/lib/server/auth";
import { clientKey, handle, json, rateLimit } from "@/lib/server/http";

export async function GET(req: Request) {
  return handle(() => {
    rateLimit(`nonce:${clientKey(req)}`, 60, 10 * 60_000);
    return json({ nonce: issueNonce(), issuedAt: new Date().toISOString() });
  });
}
