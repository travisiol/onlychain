"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { PostCard } from "@/components/posts/PostCard";
import { useSession } from "@/components/session";
import { ColumnHeader, SignInDoor } from "@/components/shell/AppShell";
import { api } from "@/lib/client/api";
import type { Post } from "@/lib/model";

/** The posts you saved — the reference's Collections. Access is whatever the chain says today. */
export function Collections() {
  const { session } = useSession();
  const data = useQuery({
    queryKey: ["collections", session?.address],
    queryFn: () => api<{ posts: Post[] }>("/api/collections"),
    enabled: Boolean(session),
  });
  if (!session) {
    return (
      <>
        <ColumnHeader title="Collections" />
        <SignInDoor what="your collections" />
      </>
    );
  }
  const posts = data.data?.posts ?? [];
  return (
    <>
      <ColumnHeader title="Collections" sub={data.data ? `${posts.length} saved` : undefined} />
      {data.isPending && <p className="p-4 text-[14px] text-ink-2">Loading…</p>}
      {data.data && posts.length === 0 && (
        <div className="px-6 py-16 text-center">
          <Icon name="bookmark" size={40} className="mx-auto text-ink-3" />
          <h2 className="mt-3 text-[18px] font-bold">Nothing saved yet</h2>
          <p className="mx-auto mt-1 max-w-[360px] text-[14px] text-ink-2">Tap the bookmark on any post to keep it here.</p>
          <Link href="/explore" className="btn btn-accent mt-5">
            Explore creators
          </Link>
        </div>
      )}
      {posts.map((p) => (
        <PostCard key={p.id} post={p} onChange={() => data.refetch()} />
      ))}
    </>
  );
}
