"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { CreatorCard, type CreatorCardData } from "@/components/creators/CreatorCard";
import { PostCard } from "@/components/posts/PostCard";
import { useSession } from "@/components/session";
import { ColumnHeader } from "@/components/shell/AppShell";
import { api } from "@/lib/client/api";
import { setLocationSearch, useLocationSearch } from "@/lib/client/location";
import type { Post } from "@/lib/model";

type ExploreData = { creators: CreatorCardData[]; categories: string[]; posts: Post[] };

/** Discovery — the one page the reference does not have and a wallet-native site needs. Public. */
export function Explore() {
  const { session } = useSession();
  const q = useLocationSearch("q") ?? "";
  const category = useLocationSearch("category") ?? "";
  const [draft, setDraft] = useState(q);
  const data = useQuery({
    queryKey: ["explore", q, category, session?.address ?? "anon"],
    queryFn: () => api<ExploreData>(`/api/creators?posts=1&q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`),
  });

  return (
    <>
      <ColumnHeader title="Explore" sub="Creators paid in $ONLY" />
      <div className="border-b border-line px-4 py-3">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            setLocationSearch("q", draft.trim() || null);
          }}
        >
          <Icon name="search" size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" />
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search by name, handle or category" className="field rounded-full pl-11 pr-24" aria-label="Search" />
          {(draft || q) && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold uppercase tracking-[0.04em] text-ink-2 hover:text-ink"
              onClick={() => {
                setDraft("");
                setLocationSearch("q", null);
              }}
            >
              Clear
            </button>
          )}
        </form>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <Chip active={!category} onClick={() => setLocationSearch("category", null)}>
            All
          </Chip>
          {(data.data?.categories ?? []).map((c) => (
            <Chip key={c} active={category.toLowerCase() === c.toLowerCase()} onClick={() => setLocationSearch("category", c)}>
              {c}
            </Chip>
          ))}
        </div>
      </div>

      {data.isPending && (
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[150px] animate-pulse rounded-[10px] bg-bg-3" />
          ))}
        </div>
      )}
      {data.data && data.data.creators.length === 0 && <p className="p-6 text-center text-[14px] text-ink-2">No creator matches that.</p>}
      {data.data && data.data.creators.length > 0 && (
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {data.data.creators.map((c) => (
            <CreatorCard key={c.address} creator={c} />
          ))}
        </div>
      )}

      {data.data && data.data.posts.length > 0 && !q && !category && (
        <section className="border-t border-line">
          <h2 className="eyebrow px-4 pt-4">Free posts</h2>
          {data.data.posts.map((p) => (
            <PostCard key={p.id} post={p} onChange={() => data.refetch()} />
          ))}
        </section>
      )}
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${active ? "border-accent bg-accent text-white" : "border-line-2 text-ink-2 hover:bg-bg-2"}`}>
      {children}
    </button>
  );
}
