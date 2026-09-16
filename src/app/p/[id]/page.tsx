import type { Metadata } from "next";
import { PostDetail } from "@/components/posts/PostDetail";
import { AppShell } from "@/components/shell/AppShell";

export const metadata: Metadata = { title: "Post" };

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <PostDetail id={id} />
    </AppShell>
  );
}
