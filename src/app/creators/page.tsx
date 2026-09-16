import type { Metadata } from "next";
import { CreatorPortal } from "@/components/creators/CreatorPortal";
import { AppShell } from "@/components/shell/AppShell";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "For creators", description: `Open a page on ${site.name} with a wallet — no identity, no bank account. Keep ${100 - site.feeBps / 100}% of every payment, settled instantly in $${site.token.symbol}.` };

export default function CreatorsPage() {
  return (
    <AppShell>
      <CreatorPortal />
    </AppShell>
  );
}
