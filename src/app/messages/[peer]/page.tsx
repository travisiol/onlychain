import type { Metadata } from "next";
import { MessagesLayout } from "@/components/messages/MessagesLayout";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: "Messages" };

export default async function ThreadPage({ params }: { params: Promise<{ peer: string }> }) {
  const { peer } = await params;
  return (
    <AppShell wide right={null}>
      <MessagesLayout peer={decodeURIComponent(peer)} />
    </AppShell>
  );
}
