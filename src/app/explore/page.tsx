import type { Metadata } from "next";
import { Explore } from "@/components/creators/Explore";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: "Explore creators" };

export default function ExplorePage() {
  return (
    <AppShell>
      <Explore />
    </AppShell>
  );
}
