import type { Metadata } from "next";
import { Notifications } from "@/components/feed/Notifications";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <AppShell>
      <Notifications />
    </AppShell>
  );
}
