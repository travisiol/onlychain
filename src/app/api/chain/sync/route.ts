import { requireSession } from "@/lib/server/auth";
import { handle, json, readJson, ServiceError } from "@/lib/server/http";
import { syncTx } from "@/lib/server/sync";

/**
 * The browser just confirmed a transaction: index its receipt now, so the
 * next page load already knows about the payment. Anyone signed in can
 * ask; the chain is the one being believed.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const body = await readJson(req);
    const hash = String(body.txHash ?? "");
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new ServiceError("Bad transaction hash.");
    const result = await syncTx(hash as `0x${string}`);
    return json(result);
  });
}
