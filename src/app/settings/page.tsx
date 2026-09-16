import type { Metadata } from "next";
import { Settings } from "@/components/studio/Settings";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <AppShell>
      <Settings />
    </AppShell>
  );
}
