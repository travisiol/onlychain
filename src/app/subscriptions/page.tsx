import type { Metadata } from "next";
import { Subscriptions } from "@/components/feed/Subscriptions";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: "Subscriptions" };

export default function SubscriptionsPage() {
  return (
    <AppShell>
      <Subscriptions />
    </AppShell>
  );
}
