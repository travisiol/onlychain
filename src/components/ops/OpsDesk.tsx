"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { useSession } from "@/components/session";
import { ColumnHeader, SignInDoor } from "@/components/shell/AppShell";
import { api } from "@/lib/client/api";
import { useNow } from "@/lib/client/now";
import { displayName, handleOf, profileHref, timeAgo } from "@/lib/format";
import type { Report } from "@/lib/model";

type Creator = { address: `0x${string}`; handle: string | null; displayName: string; avatar: string | null; hue: number; verified: boolean; suspended: boolean; isCreator: boolean; category: string; createdAt: number; sample: boolean };
type OpsData = {
  open: boolean;
  counts: { creators: number; suspended: number; posts: number; openReports: number; profiles: number };
  reports: Report[];
  creators: Creator[];
  storage: { ephemeral: boolean; reason: string | null; dbPath: string; uploadDir: string };
  sync: { cursor: number | null };
};

/** The operator's desk: reports, creators, the site's vital signs. */
export function OpsDesk() {
  const { session, ops } = useSession();
  const qc = useQueryClient();
  const now = useNow();
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const data = useQuery({
    queryKey: ["ops", q, showAll],
    queryFn: () => api<OpsData>(`/api/ops?q=${encodeURIComponent(q)}${showAll ? "&reports=all" : ""}`),
    enabled: Boolean(session && ops),
    refetchInterval: 30_000,
  });

  const act = async (action: string, target: string) => {
    try {
      await api("/api/ops", { body: { action, target } });
      await qc.invalidateQueries({ queryKey: ["ops"] });
    } catch (err) {
      alert((err as Error).message);
    }
  };

  if (!session) {
    return (
      <>
        <ColumnHeader title="Operator" />
        <SignInDoor what="the operator desk" />
      </>
    );
  }
  if (!ops) {
    return (
      <>
        <ColumnHeader title="Operator" />
        <p className="p-6 text-[14px] text-ink-2">This wallet is not an operator. Operators are the wallets listed in OPS_ADDRESSES on the server.</p>
      </>
    );
  }
  const d = data.data;
  return (
    <>
      <ColumnHeader title="Operator" sub={d ? `${d.counts.openReports} open reports · ${d.counts.creators} creators · ${d.counts.posts} posts` : undefined} />
      {d?.open && <p className="border-b border-line bg-gold/10 px-4 py-2 text-[13px] text-ink-2">Open mode: OPS_ADDRESSES is unset on the local chain, so every signed-in wallet is an operator here. Set it before deploying.</p>}
      {d?.storage.ephemeral && <p className="border-b border-line bg-danger/10 px-4 py-2 text-[13px] text-danger">Storage is ephemeral on this host ({d.storage.reason}): the database and uploads reset on every cold start. Point ONLYCHAIN_DB_PATH / ONLYCHAIN_UPLOAD_DIR at a persistent disk.</p>}

      <section className="border-b border-line px-4 py-4">
        <div className="flex items-center justify-between">
          <h2 className="eyebrow">Reports</h2>
          <label className="flex items-center gap-2 text-[12px] text-ink-2">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-[var(--color-accent)]" /> include resolved
          </label>
        </div>
        {d && d.reports.length === 0 && <p className="mt-2 text-[13px] text-ink-3">Nothing open.</p>}
        <ul className="mt-2 space-y-3">
          {d?.reports.map((r) => (
            <li key={r.id} className={`rounded-[8px] border border-line p-3 text-[13px] ${r.status === "resolved" ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded-full bg-bg-3 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-2">{r.kind}</span>
                <span className="text-ink-2">{timeAgo(r.createdAt, now || r.createdAt)}</span>
                <span className="text-ink-2">· by</span>
                <Link href={profileHref(r.reporter)} className="font-medium hover:underline">
                  {displayName(r.reporter)}
                </Link>
                {r.status === "resolved" && <span className="text-success">resolved</span>}
              </div>
              <p className="mt-1">
                {r.about.href ? (
                  <Link href={r.about.href} className="text-accent hover:underline">
                    {r.about.label}
                  </Link>
                ) : (
                  r.about.label
                )}
                {r.about.owner && (
                  <>
                    {" "}
                    — by{" "}
                    <Link href={profileHref(r.about.owner)} className="font-medium hover:underline">
                      {displayName(r.about.owner)}
                    </Link>
                  </>
                )}
              </p>
              <p className="mt-1 text-ink-2">“{r.reason}”</p>
              {r.status === "open" && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.kind === "post" && r.about.href && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => confirm("Hide this post for everyone?") && act("hidePost", r.target)}>
                      Hide post
                    </button>
                  )}
                  {r.about.owner && (
                    <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => confirm(`Suspend ${displayName(r.about.owner!)}? Their page becomes unavailable and they cannot post or message.`) && act("suspend", r.about.owner!.address)}>
                      Suspend owner
                    </button>
                  )}
                  <button type="button" className="btn btn-accent btn-sm" onClick={() => act("resolve", r.id)}>
                    Resolve
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-b border-line px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="eyebrow">Creators</h2>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search handle, name, category" className="field h-8 w-[240px] rounded-full text-[13px]" />
        </div>
        <ul className="mt-2 divide-y divide-line">
          {d?.creators.map((c) => (
            <li key={c.address} className="flex items-center gap-3 py-2 text-[13px]">
              <Avatar profile={c} size={32} />
              <div className="min-w-0 flex-1">
                <Link href={profileHref(c)} className="font-medium hover:underline">
                  {displayName(c)}
                </Link>{" "}
                <span className="text-ink-2">{handleOf(c)}</span>
                {c.category && <span className="text-ink-3"> · {c.category}</span>}
                {c.sample && <span className="ml-1 rounded-full bg-bg-3 px-1.5 text-[10px] font-semibold uppercase text-ink-2">sample</span>}
                {c.suspended && <span className="ml-1 rounded-full bg-danger/10 px-1.5 text-[10px] font-semibold uppercase text-danger">suspended</span>}
              </div>
              <button type="button" className={`btn btn-sm ${c.verified ? "btn-accent" : "btn-ghost"}`} onClick={() => act(c.verified ? "unverify" : "verify", c.address)} title={c.verified ? "Remove the badge" : "Grant the verified badge"}>
                <Icon name="verified" size={14} /> {c.verified ? "Verified" : "Verify"}
              </button>
              <button type="button" className={`btn btn-sm ${c.suspended ? "btn-accent" : "btn-ghost text-danger"}`} onClick={() => (c.suspended || confirm(`Suspend ${displayName(c)}?`)) && act(c.suspended ? "unsuspend" : "suspend", c.address)}>
                {c.suspended ? "Unsuspend" : "Suspend"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {d && (
        <section className="px-4 py-4 text-[13px] text-ink-2">
          <h2 className="eyebrow">Vital signs</h2>
          <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-[180px_1fr]">
            <dt>Profiles / creators</dt>
            <dd>
              {d.counts.profiles} / {d.counts.creators} ({d.counts.suspended} suspended)
            </dd>
            <dt>Posts</dt>
            <dd>{d.counts.posts}</dd>
            <dt>Events indexed up to</dt>
            <dd className="mono">block {d.sync.cursor ?? "—"}</dd>
            <dt>Database</dt>
            <dd className="mono break-all">{d.storage.dbPath}</dd>
            <dt>Uploads</dt>
            <dd className="mono break-all">{d.storage.uploadDir}</dd>
          </dl>
        </section>
      )}
    </>
  );
}
