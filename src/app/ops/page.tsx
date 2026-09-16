import type { Metadata } from "next";
import { OpsDesk } from "@/components/ops/OpsDesk";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: "Operator" };

export default function OpsPage() {
  return (
    <AppShell right={null} wide>
      <OpsDesk />
    </AppShell>
  );
}
