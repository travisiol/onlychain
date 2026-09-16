import type { Metadata } from "next";
import { Studio } from "@/components/studio/Studio";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: "Studio" };

export default function StudioPage() {
  return (
    <AppShell>
      <Studio />
    </AppShell>
  );
}
