import { clearSession } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";

export async function POST() {
  return handle(async () => {
    await clearSession();
    return json({ ok: true });
  });
}
