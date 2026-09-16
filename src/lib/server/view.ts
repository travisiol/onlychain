import "server-only";
import { getAddress } from "viem";
import { contentIdOf, isSubscribed, subscriptionsOf, unlockedAmount } from "@/lib/server/chainReads";
import { getProfiles, listPostMedia, mediaUrl, summaryOf, type CommentRow, type MediaRow, type MessageRow, type PostRow } from "@/lib/server/store";
import type { Comment, Message, Post, Profile } from "@/lib/model";

/**
 * Rows → what a given viewer may see. The rule for a post:
 *
 *   free         → everyone
 *   subscribers  → the creator, or a wallet the chain says is subscribed
 *   ppv          → the creator, or a wallet that has paid at least the price
 *
 * When the viewer may not see it, `media` is null: the URL of the file
 * never leaves the server, so there is nothing to blur and nothing to leak.
 */

const mediaKind = (mime: string | null): "image" | "video" => (mime?.startsWith("video/") ? "video" : "image");
const toRef = (m: MediaRow) => ({ url: mediaUrl(m.id)!, kind: mediaKind(m.mime), width: m.width, height: m.height });

export async function canViewPost(row: Pick<PostRow, "id" | "creator" | "access" | "price">, viewer: string | null, subscribed?: boolean): Promise<boolean> {
  if (row.access === "free") return true;
  if (!viewer) return false;
  const v = getAddress(viewer);
  if (v === getAddress(row.creator)) return true;
  if (row.access === "subscribers") return subscribed ?? (await isSubscribed(row.creator, v));
  const paid = await unlockedAmount(v, contentIdOf("post", row.id));
  return paid >= BigInt(row.price || "0");
}

export async function postsForViewer(rows: PostRow[], viewer: string | null): Promise<Post[]> {
  const creators = [...new Set(rows.map((r) => r.creator))];
  const profiles = getProfiles(creators);
  const files = listPostMedia(rows.map((r) => r.id));
  // one batched chain read answers "subscribed?" for every creator on the page
  const subs = viewer ? await subscriptionsOf(viewer, creators) : new Map<string, number>();
  const now = Math.floor(Date.now() / 1000);
  const nowMs = Date.now();
  return Promise.all(
    rows.map(async (r) => {
      const subscribed = viewer ? (subs.get(getAddress(r.creator)) ?? 0) > now : false;
      const unlocked = await canViewPost(r, viewer, subscribed);
      const mine = files.get(r.id) ?? [];
      return {
        id: r.id,
        creator: summaryOf(r.creator, profiles),
        text: r.text,
        access: r.access,
        price: r.price,
        createdAt: r.created_at,
        likes: r.likes,
        comments: r.comments,
        unlocked,
        mediaCount: r.media_count,
        media: unlocked ? mine.map(toRef) : [],
        liked: r.liked > 0,
        bookmarked: r.bookmarked > 0,
        pinned: r.pinned === 1,
        scheduled: r.created_at > nowMs,
        sample: r.sample === 1,
      };
    }),
  );
}

export function commentsForViewer(rows: CommentRow[]): Comment[] {
  const profiles = getProfiles(rows.map((r) => r.address));
  return rows.map((r) => ({ id: r.id, postId: r.post_id, author: summaryOf(r.address, profiles), text: r.text, createdAt: r.created_at }));
}

export async function canViewMessage(row: Pick<MessageRow, "id" | "sender" | "recipient" | "price">, viewer: string): Promise<boolean> {
  const v = getAddress(viewer);
  if (v === getAddress(row.sender)) return true;
  if (BigInt(row.price || "0") === 0n) return true;
  const paid = await unlockedAmount(v, contentIdOf("msg", row.id));
  return paid >= BigInt(row.price);
}

export async function messagesForViewer(rows: MessageRow[], viewer: string): Promise<Message[]> {
  return Promise.all(
    rows.map(async (r) => {
      const unlocked = await canViewMessage(r, viewer);
      return {
        id: r.id,
        from: r.sender as `0x${string}`,
        to: r.recipient as `0x${string}`,
        text: r.text,
        createdAt: r.created_at,
        price: r.price,
        hasMedia: r.media_id !== null,
        unlocked,
        media: unlocked && r.media_id ? { url: mediaUrl(r.media_id)!, kind: mediaKind(r.media_mime), width: r.media_width, height: r.media_height } : null,
      };
    }),
  );
}

export function publicProfile(p: Profile): Profile {
  return p;
}
