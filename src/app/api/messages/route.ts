import { requireSession } from "@/lib/server/auth";
import { handle, json } from "@/lib/server/http";
import { seedIfEmpty } from "@/lib/server/seed";
import { getProfiles, listConversations, summaryOf } from "@/lib/server/store";
import { messagesForViewer } from "@/lib/server/view";
import type { Conversation } from "@/lib/model";

/** Your conversations, newest first. */
export async function GET() {
  return handle(async () => {
    seedIfEmpty();
    const auth = await requireSession();
    if ("response" in auth) return auth.response;
    const me = auth.session.address;
    const convos = listConversations(me);
    const profiles = getProfiles(convos.map((c) => c.peer));
    const lasts = await messagesForViewer(
      convos.map((c) => c.last),
      me,
    );
    const conversations: Conversation[] = convos.map((c, i) => ({ peer: summaryOf(c.peer, profiles), last: lasts[i], unread: c.unread }));
    return json({ conversations });
  });
}
