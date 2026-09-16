"use client";

import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { CreatorCard, type CreatorCardData } from "@/components/creators/CreatorCard";
import { Composer } from "@/components/posts/Composer";
import { PostCard } from "@/components/posts/PostCard";
import { useSession } from "@/components/session";
import { ColumnHeader, SignInDoor } from "@/components/shell/AppShell";
import { api } from "@/lib/client/api";
import { useLocationSearch } from "@/lib/client/location";
import type { Post } from "@/lib/model";

type FeedPage = { posts: Post[]; following: number; suggestions: CreatorCardData[]; nextBefore: number | null };

/** Home: your composer (creators), then the posts of everyone you are subscribed to. */
export function HomeFeed() {
  const { session, profile } = useSession();
  const compose = useLocationSearch("compose") === "1";
  const feed = useInfiniteQuery({
    queryKey: ["feed", session?.address],
    queryFn: ({ pageParam }) => api<FeedPage>(`/api/feed${pageParam ? `?before=${pageParam}` : ""}`),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: Boolean(session),
    refetchInterval: 30_000,
  });

  if (!session) {
    return (
      <>
        <ColumnHeader title="Home" />
        <SignInDoor what="your feed" />
      </>
    );
  }

  const first = feed.data?.pages[0];
  const posts = feed.data?.pages.flatMap((p) => p.posts) ?? [];

  return (
    <>
      <ColumnHeader title="Home" sub={first ? `${first.following} ${first.following === 1 ? "subscription" : "subscriptions"}` : undefined} />
      <Composer autoFocus={compose} />

      {feed.isPending && (
        <div className="space-y-4 p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse space-y-3">
              <div className="h-10 w-1/2 rounded-full bg-bg-3" />
              <div className="aspect-[4/3] rounded-[8px] bg-bg-3" />
            </div>
          ))}
        </div>
      )}
      {feed.isError && <p className="p-4 text-[14px] text-danger">{(feed.error as Error).message}</p>}

      {first && posts.length === 0 && (
        <div className="px-4 py-10 text-center">
          <Icon name="compass" size={40} className="mx-auto text-ink-3" />
          <h2 className="mt-3 text-[18px] font-bold">{profile?.isCreator ? "Your feed is quiet" : "Nothing here yet"}</h2>
          <p className="mx-auto mt-1 max-w-[380px] text-[14px] text-ink-2">Subscribe to a creator and their posts land here. Free pages count too — subscribing costs only gas.</p>
          <Link href="/explore" className="btn btn-accent mt-5">
            Explore creators
          </Link>
        </div>
      )}

      {posts.map((post) => (
        <PostCard key={post.id} post={post} onChange={() => feed.refetch()} />
      ))}

      {feed.hasNextPage && (
        <div className="p-4 text-center">
          <button type="button" className="btn btn-ghost" onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage}>
            {feed.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {first && first.suggestions.length > 0 && (
        <section className="border-t border-line px-4 py-5 lg:hidden">
          <h2 className="eyebrow mb-3">Suggestions</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {first.suggestions.slice(0, 4).map((c) => (
              <CreatorCard key={c.address} creator={c} compact />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
