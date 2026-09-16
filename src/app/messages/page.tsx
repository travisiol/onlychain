import type { Metadata } from "next";
import { MessagesLayout } from "@/components/messages/MessagesLayout";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: "Messages" };

export default function MessagesPage() {
  return (
    <AppShell wide right={null}>
      <MessagesLayout />
    </AppShell>
  );
}
