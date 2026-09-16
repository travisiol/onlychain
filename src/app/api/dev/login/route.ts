import { getAddress } from "viem";
import { setSession } from "@/lib/server/auth";
import { serverChainEnv } from "@/lib/server/env";
import { handle, json } from "@/lib/server/http";
import { seedIfEmpty } from "@/lib/server/seed";
import personas from "@/lib/seed/personas.json";

/**
 * Local demo only: sign in as one of the sample wallets without a wallet —
 * `/api/dev/login?as=theo` (a fan) or `?as=lunavega` (a creator). Refused
 * unless the server is pointed at the local Hardhat chain (31337) and not
 * running in production, so it cannot exist on a deployment.
 */
export async function GET(req: Request) {
  return handle(async () => {
    if (serverChainEnv().chainId !== 31337 || process.env.NODE_ENV === "production") return json({ error: "Not here." }, { status: 404 });
    seedIfEmpty();
    const as = new URL(req.url).searchParams.get("as")?.toLowerCase() ?? "theo";
    const persona = [...personas.fans, ...personas.creators].find((p) => p.handle === as);
    if (!persona) return json({ error: "Unknown sample wallet." }, { status: 404 });
    await setSession(getAddress(persona.address));
    return Response.redirect(new URL("/home", req.url), 303);
  });
}
