"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { PostCard } from "@/components/posts/PostCard";
import { useSession } from "@/components/session";
import { ColumnHeader } from "@/components/shell/AppShell";
import { api } from "@/lib/client/api";
import { useNow } from "@/lib/client/now";
import { displayName, profileHref, timeAgo } from "@/lib/format";
import type { Comment, Post } from "@/lib/model";

/** One post with its comments and the "add a comment" row. */
export function PostDetail({ id }: { id: string }) {
  const { session, profile } = useSession();
  const now = useNow();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = useQuery({
    queryKey: ["post", id, session?.address ?? "anon"],
    queryFn: () => api<{ post: Post; comments: Comment[] }>(`/api/posts/${id}`),
  });

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/posts/${id}/comments`, { body: { text } });
      setText("");
      await data.refetch();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (data.isPending) {
    return (
      <>
        <ColumnHeader title="Post" back />
        <div className="animate-pulse p-4">
          <div className="h-10 w-1/2 rounded-full bg-bg-3" />
          <div className="mt-3 aspect-[4/3] rounded-[8px] bg-bg-3" />
        </div>
      </>
    );
  }
  if (data.isError || !data.data) return <p className="p-6 text-danger">{(data.error as Error)?.message ?? "Not found."}</p>;
  const { post, comments } = data.data;

  return (
    <>
      <ColumnHeader title="Post" back sub={`by ${displayName(post.creator)}`} />
      <PostCard post={post} onChange={() => data.refetch()} detail />

      <section className="px-4 py-3">
        <h2 className="eyebrow mb-2">{comments.length === 0 ? "Comments" : `${comments.length} ${comments.length === 1 ? "comment" : "comments"}`}</h2>
        {comments.length === 0 && <p className="text-[14px] text-ink-2">{post.unlocked ? "Be the first to comment." : "Unlock the post to read and write comments."}</p>}
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Link href={profileHref(c.author)}>
                <Avatar profile={c.author} size={34} />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <Link href={profileHref(c.author)} className="text-[14px] font-semibold hover:underline">
                    {displayName(c.author)}
                  </Link>
                  <span className="text-[12px] text-ink-3">{timeAgo(c.createdAt, now || c.createdAt)}</span>
                  {session && (c.author.address === session.address || post.creator.address === session.address) && (
                    <button
                      type="button"
                      className="ml-auto text-[12px] text-ink-3 hover:text-danger"
                      onClick={async () => {
                        await api(`/api/comments/${c.id}`, { method: "DELETE" }).catch(() => null);
                        data.refetch();
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="text-[14px] leading-snug">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>

        {session && profile && post.unlocked && (
          <form
            className="mt-4 flex items-center gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <Avatar profile={profile} size={34} />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" className="field h-10 flex-1 rounded-full" maxLength={1000} />
            <button type="submit" className="icon-btn text-accent" disabled={busy || !text.trim()} aria-label="Send">
              {busy ? <Icon name="spinner" size={20} className="spin" /> : <Icon name="send" size={20} />}
            </button>
          </form>
        )}
        {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
      </section>
    </>
  );
}
