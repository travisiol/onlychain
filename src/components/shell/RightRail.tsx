"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/Icon";
import { useSession } from "@/components/session";
import { CreatorCard, type CreatorCardData } from "@/components/creators/CreatorCard";
import { api } from "@/lib/client/api";
import { useNow } from "@/lib/client/now";
import { site } from "@/lib/site";

const YEAR = new Date().getUTCFullYear();

/** Search, then a stack of suggested creators — the reference's right column. */
export function RightRail() {
  const router = useRouter();
  const { session } = useSession();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const now = useNow();
  const suggestions = useQuery({
    queryKey: ["suggestions", session?.address ?? "anon"],
    queryFn: () => api<{ creators: CreatorCardData[] }>("/api/creators?limit=24"),
    staleTime: 60_000,
  });
  const all = (suggestions.data?.creators ?? []).filter((c) => !(now > 0 && (c.viewerUntil ?? 0) * 1000 > now));
  const perPage = 3;
  const pages = Math.max(1, Math.ceil(all.length / perPage));
  const shown = all.slice((page % pages) * perPage, (page % pages) * perPage + perPage);

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.push(q.trim() ? `/explore?q=${encodeURIComponent(q.trim())}` : "/explore");
        }}
        className="relative"
      >
        <Icon name="search" size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search creators" className="field rounded-full pl-11" aria-label="Search creators" />
      </form>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow">Suggestions</h2>
          <div className="flex items-center gap-1">
            <button type="button" className="icon-btn h-8 w-8" onClick={() => setPage((p) => p + 1)} aria-label="More suggestions" title="More suggestions">
              <Icon name="chevron" size={18} />
            </button>
          </div>
        </div>
        <div className="space-y-3">
          {suggestions.isPending && [0, 1, 2].map((i) => <div key={i} className="h-[150px] animate-pulse rounded-[10px] bg-bg-3" />)}
          {shown.map((c) => (
            <CreatorCard key={c.address} creator={c} />
          ))}
          {!suggestions.isPending && shown.length === 0 && <p className="text-[13px] text-ink-2">You follow everyone here. Explore for more.</p>}
        </div>
        <Link href="/explore" className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
          Explore all creators <Icon name="chevron" size={14} />
        </Link>
      </section>

      <footer className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-3">
        <Link href="/token" className="hover:text-ink-2">
          ${site.token.symbol}
        </Link>
        <Link href="/creators" className="hover:text-ink-2">
          For creators
        </Link>
        <Link href="/token#how" className="hover:text-ink-2">
          How it works
        </Link>
        <Link href="/token#faq" className="hover:text-ink-2">
          FAQ
        </Link>
        <Link href="/token#terms" className="hover:text-ink-2">
          Terms
        </Link>
        <Link href="/token#privacy" className="hover:text-ink-2">
          Privacy
        </Link>
        <span>© {YEAR} {site.name}</span>
      </footer>
    </div>
  );
}
