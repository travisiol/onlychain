import { chainConfigured, hubInfo, publicClient } from "@/lib/server/chainReads";
import { placement } from "@/lib/server/db";
import { serverChainEnv } from "@/lib/server/env";
import { handle, json } from "@/lib/server/http";
import { seedIfEmpty } from "@/lib/server/seed";
import { counts } from "@/lib/server/store";
import { syncStatus } from "@/lib/server/sync";

/** What this deployment is: chain, contracts, storage, and whether the chain answers. */
export async function GET() {
  return handle(async () => {
    seedIfEmpty();
    const env = serverChainEnv();
    const p = placement();
    let block: number | null = null;
    try {
      block = Number(await publicClient().getBlockNumber());
    } catch {
      /* chain unreachable */
    }
    return json({
      ok: true,
      chain: { id: env.chainId, rpc: env.rpcUrl, hub: env.hub, token: env.token, configured: chainConfigured(), reachable: block !== null, block },
      hub: await hubInfo(),
      storage: { ephemeral: p.ephemeral, reason: p.reason },
      counts: counts(),
      sync: syncStatus(),
    });
  });
}
