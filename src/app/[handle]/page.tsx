import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreatorPage } from "@/components/creators/CreatorPage";
import { AppShell } from "@/components/shell/AppShell";
import { seedIfEmpty } from "@/lib/server/seed";
import { resolveProfile } from "@/lib/server/store";
import { displayName } from "@/lib/format";
import { RESERVED_HANDLES } from "@/lib/site";

/** onlychain/<handle> — a creator's page, as the reference addresses them. */
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  seedIfEmpty();
  const profile = resolveProfile(decodeURIComponent(handle));
  if (!profile) return { title: "Not found" };
  const name = displayName(profile);
  return { title: `${name} (@${profile.handle ?? profile.address.slice(0, 8)})`, description: profile.bio || undefined, openGraph: { title: name, description: profile.bio || undefined } };
}

export default async function HandlePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const ref = decodeURIComponent(handle);
  if (RESERVED_HANDLES.has(ref.toLowerCase())) notFound();
  seedIfEmpty();
  const profile = resolveProfile(ref);
  if (!profile) notFound();
  return (
    <AppShell>
      <CreatorPage refKey={profile.handle ?? profile.address} />
    </AppShell>
  );
}
