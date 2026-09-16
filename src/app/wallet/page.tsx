import type { Metadata } from "next";
import { Wallet } from "@/components/wallet/Wallet";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: "Wallet" };

export default function WalletPage() {
  return (
    <AppShell>
      <Wallet />
    </AppShell>
  );
}
