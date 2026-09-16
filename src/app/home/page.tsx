import type { Metadata } from "next";
import { HomeFeed } from "@/components/feed/HomeFeed";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return (
    <AppShell>
      <HomeFeed />
    </AppShell>
  );
}
