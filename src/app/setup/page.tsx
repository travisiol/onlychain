import type { Metadata } from "next";
import { Setup } from "@/components/setup/Setup";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: "Set up the coin" };

export default function SetupPage() {
  return (
    <AppShell right={null} wide>
      <Setup />
    </AppShell>
  );
}
