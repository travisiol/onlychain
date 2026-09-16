import { getSession, isOps } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { getProfile, unreadMessages } from "@/lib/server/store";
import { seedIfEmpty } from "@/lib/server/seed";

/** The signed-in wallet, its profile and the badge counts the shell shows. */
export async function GET() {
  return handle(async () => {
    seedIfEmpty();
    const session = await getSession();
    if (!session) return json({ session: null, profile: null, unread: 0, ops: false });
    return json({ session, profile: getProfile(session.address), unread: unreadMessages(session.address), ops: isOps(session.address) });
  });
}
