import "server-only";
import { randomBytes } from "node:crypto";
import { getAddress } from "viem";
import { db } from "@/lib/server/db";
import type { Address, ChainEvent, ChainEventKind, PostAccess, Profile, ProfileSummary } from "@/lib/model";

/**
 * Every query the site makes, as plain functions over the SQLite handle.
 * Rows come out typed; the API layer decides what the viewer may see.
 */

export const newId = () => randomBytes(9).toString("base64url");

// ─────────────────────────────── profiles ───────────────────────────────

export type ProfileRow = {
  address: string;
  handle: string | null;
  display_name: string;
  bio: string;
  category: string;
  avatar_media: string | null;
  cover_media: string | null;
  is_creator: number;
  verified: number;
  hue: number;
  created_at: number;
  sample: number;
  welcome_message: string;
  suspended: number;
};

export const mediaUrl = (id: string | null) => (id ? `/api/media/${id}` : null);

export function profileFromRow(r: ProfileRow): Profile {
  return {
    address: r.address as Address,
    handle: r.handle,
    displayName: r.display_name,
    bio: r.bio,
    category: r.category,
    avatar: mediaUrl(r.avatar_media),
    cover: mediaUrl(r.cover_media),
    isCreator: r.is_creator === 1,
    verified: r.verified === 1,
    hue: r.hue,
    createdAt: r.created_at,
    sample: r.sample === 1,
    welcomeMessage: r.welcome_message ?? "",
    suspended: r.suspended === 1,
  };
}

export function summary(p: Profile): ProfileSummary {
  return { address: p.address, handle: p.handle, displayName: p.displayName, avatar: p.avatar, verified: p.verified, hue: p.hue, isCreator: p.isCreator };
}

/** A hue from an address, so a wallet without a profile still has a colour. */
export function hueOf(address: string): number {
  return parseInt(address.slice(2, 8), 16) % 360;
}

export function getProfile(address: string): Profile | null {
  const row = db().prepare("SELECT * FROM profiles WHERE address = ?").get(getAddress(address)) as ProfileRow | undefined;
  return row ? profileFromRow(row) : null;
}

export function getProfileByHandle(handle: string): Profile | null {
  const row = db().prepare("SELECT * FROM profiles WHERE handle = ?").get(handle.toLowerCase()) as ProfileRow | undefined;
  return row ? profileFromRow(row) : null;
}

/** Resolve `@handle` or an address to a profile. */
export function resolveProfile(ref: string): Profile | null {
  const clean = ref.replace(/^@/, "");
  if (/^0x[0-9a-fA-F]{40}$/.test(clean)) return getProfile(clean);
  return getProfileByHandle(clean);
}

export function ensureProfile(address: string): Profile {
  const addr = getAddress(address);
  const existing = getProfile(addr);
  if (existing) return existing;
  db()
    .prepare("INSERT INTO profiles(address, display_name, hue, created_at) VALUES (?, ?, ?, ?)")
    .run(addr, "", hueOf(addr), Date.now());
  return getProfile(addr)!;
}

export function getProfiles(addresses: string[]): Map<string, Profile> {
  const out = new Map<string, Profile>();
  const unique = [...new Set(addresses.map((a) => getAddress(a)))];
  if (unique.length === 0) return out;
  const marks = unique.map(() => "?").join(",");
  const rows = db().prepare(`SELECT * FROM profiles WHERE address IN (${marks})`).all(...unique) as ProfileRow[];
  for (const r of rows) out.set(r.address, profileFromRow(r));
  return out;
}

/** A summary for any address, profile or not. */
export function summaryOf(address: string, profiles?: Map<string, Profile>): ProfileSummary {
  const addr = getAddress(address);
  const p = profiles?.get(addr) ?? getProfile(addr);
  if (p) return summary(p);
  return { address: addr, handle: null, displayName: "", avatar: null, verified: false, hue: hueOf(addr), isCreator: false };
}

export function updateProfile(
  address: string,
  patch: Partial<{ handle: string | null; displayName: string; bio: string; category: string; avatarMedia: string | null; coverMedia: string | null; isCreator: boolean; hue: number; welcomeMessage: string }>,
): Profile {
  const p = ensureProfile(address);
  const next = {
    welcome_message: patch.welcomeMessage ?? p.welcomeMessage,
    handle: patch.handle === undefined ? p.handle : patch.handle,
    display_name: patch.displayName ?? p.displayName,
    bio: patch.bio ?? p.bio,
    category: patch.category ?? p.category,
    avatar_media: patch.avatarMedia === undefined ? (p.avatar ? p.avatar.split("/").pop()! : null) : patch.avatarMedia,
    cover_media: patch.coverMedia === undefined ? (p.cover ? p.cover.split("/").pop()! : null) : patch.coverMedia,
    is_creator: patch.isCreator === undefined ? (p.isCreator ? 1 : 0) : patch.isCreator ? 1 : 0,
    hue: patch.hue ?? p.hue,
  };
  db()
    .prepare(
      "UPDATE profiles SET handle = ?, display_name = ?, bio = ?, category = ?, avatar_media = ?, cover_media = ?, is_creator = ?, hue = ?, welcome_message = ? WHERE address = ?",
    )
    .run(next.handle, next.display_name, next.bio, next.category, next.avatar_media, next.cover_media, next.is_creator, next.hue, next.welcome_message, p.address);
  return getProfile(p.address)!;
}

export function handleTaken(handle: string, except?: string): boolean {
  const row = db().prepare("SELECT address FROM profiles WHERE handle = ?").get(handle.toLowerCase()) as { address: string } | undefined;
  return Boolean(row && (!except || row.address !== getAddress(except)));
}

export function listCreators(opts: { q?: string; category?: string; limit?: number; exclude?: string; includeSuspended?: boolean } = {}): Profile[] {
  const where: string[] = ["is_creator = 1"];
  if (!opts.includeSuspended) where.push("suspended = 0");
  const args: (string | number)[] = [];
  if (opts.q) {
    where.push("(lower(handle) LIKE ? OR lower(display_name) LIKE ? OR lower(category) LIKE ?)");
    const like = `%${opts.q.toLowerCase()}%`;
    args.push(like, like, like);
  }
  if (opts.category) {
    where.push("lower(category) = ?");
    args.push(opts.category.toLowerCase());
  }
  if (opts.exclude) {
    where.push("address <> ?");
    args.push(getAddress(opts.exclude));
  }
  args.push(opts.limit ?? 60);
  const rows = db().prepare(`SELECT * FROM profiles WHERE ${where.join(" AND ")} ORDER BY sample DESC, created_at ASC LIMIT ?`).all(...args) as ProfileRow[];
  return rows.map(profileFromRow);
}

export function listCategories(): string[] {
  const rows = db().prepare("SELECT DISTINCT category FROM profiles WHERE is_creator = 1 AND category <> '' ORDER BY category").all() as { category: string }[];
  return rows.map((r) => r.category);
}

export function creatorStats(address: string): { posts: number; media: number; likes: number } {
  const addr = getAddress(address);
  const now = Date.now();
  const posts = (db().prepare("SELECT COUNT(*) AS n FROM posts WHERE creator = ? AND deleted = 0 AND created_at <= ?").get(addr, now) as { n: number }).n;
  const media = (db().prepare("SELECT COUNT(*) AS n FROM post_media pm JOIN posts p ON p.id = pm.post_id WHERE p.creator = ? AND p.deleted = 0 AND p.created_at <= ?").get(addr, now) as { n: number }).n;
  const likes = (db().prepare("SELECT COUNT(*) AS n FROM likes l JOIN posts p ON p.id = l.post_id WHERE p.creator = ? AND p.deleted = 0").get(addr) as { n: number }).n;
  return { posts, media, likes };
}

// ─────────────────────────────── media ───────────────────────────────

export type MediaRow = { id: string; owner: string; mime: string; path: string; width: number | null; height: number | null; bytes: number; created_at: number };

export function getMedia(id: string): MediaRow | null {
  return (db().prepare("SELECT * FROM media WHERE id = ?").get(id) as MediaRow | undefined) ?? null;
}

export function insertMedia(m: Omit<MediaRow, "created_at"> & { created_at?: number }): MediaRow {
  db()
    .prepare("INSERT INTO media(id, owner, mime, path, width, height, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(m.id, getAddress(m.owner), m.mime, m.path, m.width, m.height, m.bytes, m.created_at ?? Date.now());
  return getMedia(m.id)!;
}

// ─────────────────────────────── posts ───────────────────────────────

export type PostRow = {
  id: string;
  creator: string;
  text: string;
  media_id: string | null;
  access: PostAccess;
  price: string;
  created_at: number;
  deleted: number;
  sample: number;
  pinned: number;
  likes: number;
  comments: number;
  liked: number;
  bookmarked: number;
  media_count: number;
};

/** The viewer's address goes in twice (liked, bookmarked); "" for nobody. */
const POST_SELECT = `
  SELECT p.*,
    (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes,
    (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comments,
    (SELECT COUNT(*) FROM likes l2 WHERE l2.post_id = p.id AND l2.address = ?) AS liked,
    (SELECT COUNT(*) FROM bookmarks b WHERE b.post_id = p.id AND b.address = ?) AS bookmarked,
    (SELECT COUNT(*) FROM post_media pm WHERE pm.post_id = p.id) AS media_count
  FROM posts p
`;
const viewerArgs = (viewer: string | null): [string, string] => {
  const v = viewer ? getAddress(viewer) : "";
  return [v, v];
};
/** Scheduled posts (created_at in the future) are the creator's alone until then. */
const VISIBLE = "(p.created_at <= ? OR p.creator = ?)";

export function getPost(id: string, viewer: string | null): PostRow | null {
  const row = db().prepare(`${POST_SELECT} WHERE p.id = ? AND p.deleted = 0`).get(...viewerArgs(viewer), id) as PostRow | undefined;
  return row ?? null;
}

export function listPostsByCreator(creator: string, viewer: string | null, opts: { before?: number; limit?: number; mediaOnly?: boolean; includeScheduled?: boolean } = {}): PostRow[] {
  const extra = opts.mediaOnly ? " AND p.media_id IS NOT NULL" : "";
  const v = viewer ? getAddress(viewer) : "";
  return db()
    .prepare(`${POST_SELECT} WHERE p.creator = ? AND p.deleted = 0 AND p.created_at < ? AND ${VISIBLE}${extra} ORDER BY p.pinned DESC, p.created_at DESC LIMIT ?`)
    .all(...viewerArgs(viewer), getAddress(creator), opts.before ?? Number.MAX_SAFE_INTEGER, opts.includeScheduled ? Number.MAX_SAFE_INTEGER : Date.now(), v, opts.limit ?? 30) as PostRow[];
}

export function listFeed(creators: string[], viewer: string | null, opts: { before?: number; limit?: number } = {}): PostRow[] {
  if (creators.length === 0) return [];
  const marks = creators.map(() => "?").join(",");
  const v = viewer ? getAddress(viewer) : "";
  return db()
    .prepare(`${POST_SELECT} WHERE p.creator IN (${marks}) AND p.deleted = 0 AND p.created_at < ? AND ${VISIBLE} AND p.creator NOT IN (SELECT address FROM profiles WHERE suspended = 1) ORDER BY p.created_at DESC LIMIT ?`)
    .all(...viewerArgs(viewer), ...creators.map((c) => getAddress(c)), opts.before ?? Number.MAX_SAFE_INTEGER, Date.now(), v, opts.limit ?? 30) as PostRow[];
}

/** Free posts from every creator — what a fresh wallet sees on Explore. */
export function listPublicPosts(viewer: string | null, limit = 20): PostRow[] {
  return db()
    .prepare(`${POST_SELECT} WHERE p.deleted = 0 AND p.access = 'free' AND p.created_at <= ? AND p.creator NOT IN (SELECT address FROM profiles WHERE suspended = 1) ORDER BY p.created_at DESC LIMIT ?`)
    .all(...viewerArgs(viewer), Date.now(), limit) as PostRow[];
}

/** The viewer's saved posts, newest save first. */
export function listBookmarked(viewer: string, limit = 60): PostRow[] {
  const v = getAddress(viewer);
  return db()
    .prepare(`${POST_SELECT} WHERE p.deleted = 0 AND p.id IN (SELECT post_id FROM bookmarks WHERE address = ?) AND ${VISIBLE} ORDER BY (SELECT created_at FROM bookmarks b2 WHERE b2.post_id = p.id AND b2.address = ?) DESC LIMIT ?`)
    .all(v, v, v, Date.now(), v, v, limit) as PostRow[];
}

export function insertPost(p: { id: string; creator: string; text: string; mediaIds: string[]; access: PostAccess; price: string; createdAt?: number; sample?: boolean }): void {
  const d = db();
  d.prepare("INSERT INTO posts(id, creator, text, media_id, access, price, created_at, sample) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(p.id, getAddress(p.creator), p.text, p.mediaIds[0] ?? null, p.access, p.price, p.createdAt ?? Date.now(), p.sample ? 1 : 0);
  const ins = d.prepare("INSERT OR IGNORE INTO post_media(post_id, media_id, position) VALUES (?, ?, ?)");
  p.mediaIds.forEach((m, i) => ins.run(p.id, m, i));
}

export function updatePost(id: string, creator: string, patch: { text?: string; pinned?: boolean }): boolean {
  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (patch.text !== undefined) {
    sets.push("text = ?");
    args.push(patch.text);
  }
  if (patch.pinned !== undefined) {
    sets.push("pinned = ?");
    args.push(patch.pinned ? 1 : 0);
  }
  if (sets.length === 0) return false;
  const res = db().prepare(`UPDATE posts SET ${sets.join(", ")} WHERE id = ? AND creator = ? AND deleted = 0`).run(...args, id, getAddress(creator));
  return Number(res.changes) > 0;
}

export function deletePost(id: string, creator: string): boolean {
  const res = db().prepare("UPDATE posts SET deleted = 1 WHERE id = ? AND creator = ? AND deleted = 0").run(id, getAddress(creator));
  return Number(res.changes) > 0;
}

/** The files of many posts, in order, keyed by post id. */
export function listPostMedia(postIds: string[]): Map<string, MediaRow[]> {
  const out = new Map<string, MediaRow[]>();
  if (postIds.length === 0) return out;
  const marks = postIds.map(() => "?").join(",");
  const rows = db().prepare(`SELECT pm.post_id, m.* FROM post_media pm JOIN media m ON m.id = pm.media_id WHERE pm.post_id IN (${marks}) ORDER BY pm.position ASC`).all(...postIds) as (MediaRow & { post_id: string })[];
  for (const r of rows) {
    const list = out.get(r.post_id) ?? [];
    list.push(r);
    out.set(r.post_id, list);
  }
  return out;
}

export function setLike(postId: string, address: string, on: boolean): void {
  const addr = getAddress(address);
  if (on) db().prepare("INSERT OR IGNORE INTO likes(post_id, address, created_at) VALUES (?, ?, ?)").run(postId, addr, Date.now());
  else db().prepare("DELETE FROM likes WHERE post_id = ? AND address = ?").run(postId, addr);
}

export function setBookmark(postId: string, address: string, on: boolean): void {
  const addr = getAddress(address);
  if (on) db().prepare("INSERT OR IGNORE INTO bookmarks(post_id, address, created_at) VALUES (?, ?, ?)").run(postId, addr, Date.now());
  else db().prepare("DELETE FROM bookmarks WHERE post_id = ? AND address = ?").run(postId, addr);
}

export type CommentRow = { id: string; post_id: string; address: string; text: string; created_at: number };

export function listComments(postId: string, limit = 50): CommentRow[] {
  return db().prepare("SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC LIMIT ?").all(postId, limit) as CommentRow[];
}

export function getComment(id: string): CommentRow | null {
  return (db().prepare("SELECT * FROM comments WHERE id = ?").get(id) as CommentRow | undefined) ?? null;
}

export function deleteComment(id: string): boolean {
  return Number(db().prepare("DELETE FROM comments WHERE id = ?").run(id).changes) > 0;
}

// ─────────────────────────────── blocks & reports ───────────────────────────────

export function setBlock(blocker: string, blocked: string, on: boolean): void {
  const a = getAddress(blocker);
  const b = getAddress(blocked);
  if (on) db().prepare("INSERT OR IGNORE INTO blocks(blocker, blocked, created_at) VALUES (?, ?, ?)").run(a, b, Date.now());
  else db().prepare("DELETE FROM blocks WHERE blocker = ? AND blocked = ?").run(a, b);
}

export function isBlocked(blocker: string, blocked: string): boolean {
  return Boolean(db().prepare("SELECT 1 FROM blocks WHERE blocker = ? AND blocked = ?").get(getAddress(blocker), getAddress(blocked)));
}

export function listBlocked(blocker: string): string[] {
  return (db().prepare("SELECT blocked FROM blocks WHERE blocker = ? ORDER BY created_at DESC").all(getAddress(blocker)) as { blocked: string }[]).map((r) => r.blocked);
}

export function insertReport(r: { reporter: string; kind: "post" | "profile" | "message"; target: string; reason: string }): string {
  const id = newId();
  db().prepare("INSERT INTO reports(id, reporter, kind, target, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, getAddress(r.reporter), r.kind, r.target, r.reason, Date.now());
  return id;
}

// ─────────────────────────────── operator ───────────────────────────────

export type ReportRow = { id: string; reporter: string; kind: "post" | "profile" | "message"; target: string; reason: string; created_at: number; status: "open" | "resolved" };

export function listReports(status: "open" | "resolved" | "all" = "open", limit = 100): ReportRow[] {
  const where = status === "all" ? "" : "WHERE status = ?";
  const args = status === "all" ? [limit] : [status, limit];
  return db().prepare(`SELECT * FROM reports ${where} ORDER BY created_at DESC LIMIT ?`).all(...args) as ReportRow[];
}

export function resolveReport(id: string): boolean {
  return Number(db().prepare("UPDATE reports SET status = 'resolved' WHERE id = ? AND status = 'open'").run(id).changes) > 0;
}

export function setVerified(address: string, on: boolean): void {
  db().prepare("UPDATE profiles SET verified = ? WHERE address = ?").run(on ? 1 : 0, getAddress(address));
}

export function setSuspended(address: string, on: boolean): void {
  db().prepare("UPDATE profiles SET suspended = ? WHERE address = ?").run(on ? 1 : 0, getAddress(address));
}

/** Operator removal of a post, whoever wrote it. */
export function hidePost(id: string): boolean {
  return Number(db().prepare("UPDATE posts SET deleted = 1 WHERE id = ? AND deleted = 0").run(id).changes) > 0;
}

export function opsCounts(): { creators: number; suspended: number; posts: number; openReports: number; profiles: number } {
  const one = (sql: string) => (db().prepare(sql).get() as { n: number }).n;
  return {
    creators: one("SELECT COUNT(*) AS n FROM profiles WHERE is_creator = 1"),
    suspended: one("SELECT COUNT(*) AS n FROM profiles WHERE suspended = 1"),
    posts: one("SELECT COUNT(*) AS n FROM posts WHERE deleted = 0"),
    openReports: one("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'"),
    profiles: one("SELECT COUNT(*) AS n FROM profiles"),
  };
}

// ─────────────────────────────── vault ───────────────────────────────

export type VaultRow = MediaRow & { used_in_posts: number; used_in_messages: number; is_avatar: number; is_cover: number };

/** A creator's uploads with where each is used. */
export function listVault(owner: string, limit = 200): VaultRow[] {
  return db()
    .prepare(
      `SELECT m.*,
         (SELECT COUNT(*) FROM post_media pm JOIN posts p ON p.id = pm.post_id WHERE pm.media_id = m.id AND p.deleted = 0) AS used_in_posts,
         (SELECT COUNT(*) FROM messages x WHERE x.media_id = m.id) AS used_in_messages,
         (SELECT COUNT(*) FROM profiles pr WHERE pr.avatar_media = m.id) AS is_avatar,
         (SELECT COUNT(*) FROM profiles pr2 WHERE pr2.cover_media = m.id) AS is_cover
       FROM media m WHERE m.owner = ? AND m.path NOT LIKE 'seed:%' ORDER BY m.created_at DESC LIMIT ?`,
    )
    .all(getAddress(owner), limit) as VaultRow[];
}

export function insertComment(c: { id: string; postId: string; address: string; text: string; createdAt?: number }): CommentRow {
  db().prepare("INSERT INTO comments(id, post_id, address, text, created_at) VALUES (?, ?, ?, ?, ?)").run(c.id, c.postId, getAddress(c.address), c.text, c.createdAt ?? Date.now());
  return db().prepare("SELECT * FROM comments WHERE id = ?").get(c.id) as CommentRow;
}

// ─────────────────────────────── messages ───────────────────────────────

export type MessageRow = {
  id: string;
  sender: string;
  recipient: string;
  text: string;
  media_id: string | null;
  price: string;
  created_at: number;
  read_at: number | null;
  media_mime: string | null;
  media_width: number | null;
  media_height: number | null;
};

const MESSAGE_SELECT = "SELECT x.*, m.mime AS media_mime, m.width AS media_width, m.height AS media_height FROM messages x LEFT JOIN media m ON m.id = x.media_id";

export function listThread(a: string, b: string, limit = 100): MessageRow[] {
  const A = getAddress(a);
  const B = getAddress(b);
  return db()
    .prepare(`${MESSAGE_SELECT} WHERE (x.sender = ? AND x.recipient = ?) OR (x.sender = ? AND x.recipient = ?) ORDER BY x.created_at ASC LIMIT ?`)
    .all(A, B, B, A, limit) as MessageRow[];
}

export function getMessage(id: string): MessageRow | null {
  return (db().prepare(`${MESSAGE_SELECT} WHERE x.id = ?`).get(id) as MessageRow | undefined) ?? null;
}

/** The last message of every conversation `me` is part of, newest first, with unread counts. */
export function listConversations(me: string): { peer: string; last: MessageRow; unread: number }[] {
  const addr = getAddress(me);
  const rows = db()
    .prepare(
      `${MESSAGE_SELECT} WHERE x.id IN (
         SELECT id FROM (
           SELECT id, CASE WHEN sender = ? THEN recipient ELSE sender END AS peer, created_at,
                  ROW_NUMBER() OVER (PARTITION BY CASE WHEN sender = ? THEN recipient ELSE sender END ORDER BY created_at DESC) AS rn
           FROM messages WHERE sender = ? OR recipient = ?
         ) WHERE rn = 1
       ) ORDER BY x.created_at DESC LIMIT 100`,
    )
    .all(addr, addr, addr, addr) as MessageRow[];
  const unread = db().prepare("SELECT sender, COUNT(*) AS n FROM messages WHERE recipient = ? AND read_at IS NULL GROUP BY sender").all(addr) as { sender: string; n: number }[];
  const unreadBy = new Map(unread.map((u) => [u.sender, u.n]));
  return rows.map((last) => {
    const peer = last.sender === addr ? last.recipient : last.sender;
    return { peer, last, unread: unreadBy.get(peer) ?? 0 };
  });
}

export function insertMessage(m: { id: string; sender: string; recipient: string; text: string; mediaId: string | null; price: string; createdAt?: number }): MessageRow {
  db()
    .prepare("INSERT INTO messages(id, sender, recipient, text, media_id, price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(m.id, getAddress(m.sender), getAddress(m.recipient), m.text, m.mediaId, m.price, m.createdAt ?? Date.now());
  return getMessage(m.id)!;
}

/** Has `sender` ever written to `recipient`? (the welcome message is sent once) */
export function hasMessageFrom(sender: string, recipient: string): boolean {
  return Boolean(db().prepare("SELECT 1 FROM messages WHERE sender = ? AND recipient = ? LIMIT 1").get(getAddress(sender), getAddress(recipient)));
}

export function markThreadRead(me: string, peer: string): void {
  db().prepare("UPDATE messages SET read_at = ? WHERE recipient = ? AND sender = ? AND read_at IS NULL").run(Date.now(), getAddress(me), getAddress(peer));
}

export function unreadMessages(me: string): number {
  return (db().prepare("SELECT COUNT(*) AS n FROM messages WHERE recipient = ? AND read_at IS NULL").get(getAddress(me)) as { n: number }).n;
}

// ─────────────────────────────── chain events ───────────────────────────────

export type ChainEventRow = { id: string; kind: ChainEventKind; creator: string; fan: string; amount: string; fee: string; extra: string; block: number; ts: number; tx_hash: string };

export function eventFromRow(r: ChainEventRow): ChainEvent {
  return { id: r.id, kind: r.kind, creator: r.creator as Address, fan: r.fan as Address, amount: r.amount, fee: r.fee, extra: JSON.parse(r.extra), block: r.block, ts: r.ts, txHash: r.tx_hash };
}

/** Insert if new. Returns true when the row did not exist. */
export function upsertEvent(e: ChainEvent): boolean {
  const res = db()
    .prepare("INSERT OR IGNORE INTO chain_events(id, kind, creator, fan, amount, fee, extra, block, ts, tx_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(e.id, e.kind, getAddress(e.creator), getAddress(e.fan), e.amount, e.fee, JSON.stringify(e.extra), e.block, e.ts, e.txHash);
  return Number(res.changes) > 0;
}

export function eventsForCreator(creator: string, limit = 50): ChainEvent[] {
  return (db().prepare("SELECT * FROM chain_events WHERE creator = ? AND kind <> 'plan' ORDER BY ts DESC, block DESC LIMIT ?").all(getAddress(creator), limit) as ChainEventRow[]).map(eventFromRow);
}

export function eventsForFan(fan: string, limit = 50): ChainEvent[] {
  return (db().prepare("SELECT * FROM chain_events WHERE fan = ? ORDER BY ts DESC, block DESC LIMIT ?").all(getAddress(fan), limit) as ChainEventRow[]).map(eventFromRow);
}

/** Creators this fan ever subscribed to (the chain says whether it still holds). */
export function subscribedCreators(fan: string): string[] {
  return (db().prepare("SELECT DISTINCT creator FROM chain_events WHERE fan = ? AND kind = 'subscribed'").all(getAddress(fan)) as { creator: string }[]).map((r) => r.creator);
}

/** Fans who ever subscribed to this creator. */
export function subscriberCandidates(creator: string): string[] {
  return (db().prepare("SELECT DISTINCT fan FROM chain_events WHERE creator = ? AND kind = 'subscribed'").all(getAddress(creator)) as { fan: string }[]).map((r) => r.fan);
}

export function countEvents(): number {
  return (db().prepare("SELECT COUNT(*) AS n FROM chain_events").get() as { n: number }).n;
}

// ─────────────────────────────── notifications: likes & comments on my posts ───────────────────────────────

export type SocialRow = { kind: "like" | "comment"; id: string; post_id: string; address: string; text: string | null; created_at: number };

export function socialForCreator(creator: string, limit = 50): SocialRow[] {
  return db()
    .prepare(
      `SELECT kind, id, post_id, address, text, created_at FROM (
         SELECT 'like' AS kind, l.post_id || ':' || l.address AS id, l.post_id AS post_id, l.address AS address, NULL AS text, l.created_at AS created_at
           FROM likes l JOIN posts p ON p.id = l.post_id WHERE p.creator = ? AND l.address <> ?
         UNION ALL
         SELECT 'comment' AS kind, c.id AS id, c.post_id AS post_id, c.address AS address, c.text AS text, c.created_at AS created_at
           FROM comments c JOIN posts p ON p.id = c.post_id WHERE p.creator = ? AND c.address <> ?
       ) ORDER BY created_at DESC LIMIT ?`,
    )
    .all(getAddress(creator), getAddress(creator), getAddress(creator), getAddress(creator), limit) as SocialRow[];
}

export function getSeen(address: string): number {
  const row = db().prepare("SELECT notifications_at FROM seen WHERE address = ?").get(getAddress(address)) as { notifications_at: number } | undefined;
  return row?.notifications_at ?? 0;
}

export function setSeen(address: string, at: number): void {
  db().prepare("INSERT INTO seen(address, notifications_at) VALUES (?, ?) ON CONFLICT(address) DO UPDATE SET notifications_at = excluded.notifications_at").run(getAddress(address), at);
}

export function counts(): { creators: number; posts: number; events: number } {
  const creators = (db().prepare("SELECT COUNT(*) AS n FROM profiles WHERE is_creator = 1").get() as { n: number }).n;
  const posts = (db().prepare("SELECT COUNT(*) AS n FROM posts WHERE deleted = 0").get() as { n: number }).n;
  return { creators, posts, events: countEvents() };
}
