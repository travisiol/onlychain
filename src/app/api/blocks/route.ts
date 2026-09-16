import { getAddress, isAddress } from "viem";
import { requireSession } from "@/lib/server/auth";
import { handle, json, readJson, ServiceError } from "@/lib/server/http";
import { getProfiles, listBlocked, resolveProfile, setBlock, summaryOf } from "@/lib/server/store";

/** Your block list. A blocked wallet cannot message you or comment on your posts; what the chain grants it (a subscription it paid) stays. */
export async function GET() {
  return handle(async () => {
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const list = listBlocked(auth.session.address);
    const profiles = getProfiles(list);
    return json({ blocked: list.map((a) => summaryOf(a, profiles)) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const body = await readJson(req);
    const ref = String(body.address ?? body.handle ?? "");
    const target = isAddress(ref) ? getAddress(ref) : resolveProfile(ref)?.address;
    if (!target) throw new ServiceError("No such wallet.", 404);
    if (target === auth.session.address) throw new ServiceError("That is you.");
    const on = body.on === undefined ? true : Boolean(body.on);
    setBlock(auth.session.address, target, on);
    return json({ blocked: on, address: target });
  });
}
