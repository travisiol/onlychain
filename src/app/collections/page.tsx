import type { Metadata } from "next";
import { Collections } from "@/components/feed/Collections";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: "Collections" };

export default function CollectionsPage() {
  return (
    <AppShell>
      <Collections />
    </AppShell>
  );
}
