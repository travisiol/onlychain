import { handle, json } from "@/lib/server/http";
import { priceInfo } from "@/lib/server/price";

/** ONLY → ETH (the curve) and ETH → USD (Pyth): the "≈ $" next to every price. */
export async function GET() {
  return handle(async () => json(await priceInfo(), { headers: { "cache-control": "public, max-age=30" } }));
}
