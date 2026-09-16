"use client";

import { Icon } from "@/components/Icon";
import { Conversations } from "@/components/messages/Conversations";
import { Thread } from "@/components/messages/Thread";
import { useSession } from "@/components/session";
import { ColumnHeader, SignInDoor } from "@/components/shell/AppShell";

/**
 * Messages as the reference lays them out on a desktop: the inbox on the
 * left, the open thread on the right. On a phone it is one column: the
 * inbox, then the thread with a back arrow.
 */
export function MessagesLayout({ peer }: { peer?: string }) {
  const { session } = useSession();
  if (!session) {
    return (
      <>
        <ColumnHeader title="Messages" />
        <SignInDoor what="your messages" />
      </>
    );
  }
  return (
    <div className="grid min-h-dvh lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className={`border-line lg:border-r ${peer ? "hidden lg:block" : ""}`}>
        <Conversations active={peer} />
      </div>
      <div className={peer ? "" : "hidden lg:flex"}>
        {peer ? (
          <Thread peer={peer} />
        ) : (
          <div className="flex w-full flex-col items-center justify-center px-6 py-20 text-center text-ink-2">
            <Icon name="message" size={40} className="text-ink-3" />
            <p className="mt-3 text-[14px]">Pick a conversation, or open a creator&apos;s page and tap the message icon.</p>
          </div>
        )}
      </div>
    </div>
  );
}
