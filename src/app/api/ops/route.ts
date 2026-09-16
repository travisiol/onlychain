import { getAddress, isAddress } from "viem";
import { opsIsOpen, requireOps } from "@/lib/server/auth";
import { placement } from "@/lib/server/db";
import { handle, json, readJson, ServiceError, str } from "@/lib/server/http";
import { seedIfEmpty } from "@/lib/server/seed";
import { deleteComment, getComment, getMessage, getPost, getProfiles, hidePost, listCreators, listReports, opsCounts, resolveProfile, resolveReport, setSuspended, setVerified, summaryOf, type ReportRow } from "@/lib/server/store";
import { syncStatus } from "@/lib/server/sync";
import type { Report } from "@/lib/model";

/**
 * The operator's desk: open reports with what they point at, the creators
 * (verify / suspend), the site's counters. Actions are few and blunt —
 * verify, suspend, hide a post, remove a comment, resolve a report. None
 * of them can touch a wallet's coins.
 */

function describe(r: ReportRow): Report["about"] {
  if (r.kind === "post") {
    const p = getPost(r.target, null);
    if (!p) return { label: "post (already removed)", href: null, owner: null };
    return { label: `post: “${(p.text || `${p.media_count} file(s)`).slice(0, 80)}”`, href: `/p/${p.id}`, owner: summaryOf(p.creator) };
  }
  if (r.kind === "message") {
    const m = getMessage(r.target);
    if (!m) return { label: "message (gone)", href: null, owner: null };
    return { label: `message: “${(m.text || "a file").slice(0, 80)}”`, href: null, owner: summaryOf(m.sender) };
  }
  const p = resolveProfile(r.target);
  if (!p) return { label: "profile (gone)", href: null, owner: null };
  return { label: `profile ${p.handle ? `@${p.handle}` : p.address}`, href: `/${p.handle ?? p.address}`, owner: summaryOf(p.address) };
}

export async function GET(req: Request) {
  return handle(async () => {
    seedIfEmpty();
    const auth = await requireOps();
    if ("response" in auth) return auth.response;
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim().slice(0, 40) || undefined;
    const rows = listReports(url.searchParams.get("reports") === "all" ? "all" : "open");
    const reporters = getProfiles(rows.map((r) => r.reporter));
    const reports: Report[] = rows.map((r) => ({ id: r.id, reporter: summaryOf(r.reporter, reporters), kind: r.kind, target: r.target, reason: r.reason, createdAt: r.created_at, status: r.status, about: describe(r) }));
    const creators = listCreators({ q, limit: 100, includeSuspended: true }).map((c) => ({ address: c.address, handle: c.handle, displayName: c.displayName, avatar: c.avatar, hue: c.hue, verified: c.verified, suspended: c.suspended, isCreator: c.isCreator, category: c.category, createdAt: c.createdAt, sample: c.sample }));
    return json({ open: opsIsOpen(), counts: opsCounts(), reports, creators, storage: placement(), sync: syncStatus() });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const auth = await requireOps();
    if ("response" in auth) return auth.response;
    const body = await readJson(req);
    const action = str(body.action, 30);
    const target = str(body.target, 120).trim();
    if (!target) throw new ServiceError("Nothing to act on.");
    switch (action) {
      case "verify":
      case "unverify":
      case "suspend":
      case "unsuspend": {
        const profile = isAddress(target) ? resolveProfile(getAddress(target)) : resolveProfile(target);
        if (!profile) throw new ServiceError("No such wallet.", 404);
        if (action === "verify" || action === "unverify") setVerified(profile.address, action === "verify");
        else setSuspended(profile.address, action === "suspend");
        return json({ ok: true, profile: resolveProfile(profile.address) });
      }
      case "hidePost":
        if (!hidePost(target)) throw new ServiceError("No such post, or already removed.", 404);
        return json({ ok: true });
      case "deleteComment":
        if (!getComment(target)) throw new ServiceError("No such comment.", 404);
        deleteComment(target);
        return json({ ok: true });
      case "resolve":
        if (!resolveReport(target)) throw new ServiceError("No such open report.", 404);
        return json({ ok: true });
      default:
        throw new ServiceError("Unknown action.");
    }
  });
}
