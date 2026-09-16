export type Address = `0x${string}`;

export type PostAccess = "free" | "subscribers" | "ppv";

/** What the API says about a wallet. Every address on the site has one, created on first sign-in. */
export type Profile = {
  address: Address;
  handle: string | null;
  displayName: string;
  bio: string;
  category: string;
  avatar: string | null;
  cover: string | null;
  isCreator: boolean;
  verified: boolean;
  hue: number;
  createdAt: number;
  sample: boolean;
  /** Sent automatically to every new subscriber (creators). */
  welcomeMessage: string;
  /** Set by the operator: the page is unavailable and the wallet cannot post or message. */
  suspended: boolean;
};

/** The subscription plan as the chain has it. `null` when the wallet never called setPlan. */
export type Plan = { monthlyPrice: string; open: boolean; discount3Bps: number; discount6Bps: number; discount12Bps: number; trialDays: number } | null;

export type CreatorStats = { posts: number; media: number; likes: number; subscribers: number };

export type ProfileSummary = Pick<Profile, "address" | "handle" | "displayName" | "avatar" | "verified" | "hue" | "isCreator">;

export type MediaRef = { url: string; kind: "image" | "video"; width: number | null; height: number | null };

export type Post = {
  id: string;
  creator: ProfileSummary;
  text: string;
  access: PostAccess;
  /** Pay-per-view price in token units (wei as string). "0" unless access = ppv. */
  price: string;
  createdAt: number;
  likes: number;
  comments: number;
  /** True when the viewer may see the media. When false, `media` is empty and nothing about it leaves the server. */
  unlocked: boolean;
  /** How many files the post carries (known even when locked). */
  mediaCount: number;
  media: MediaRef[];
  liked: boolean;
  bookmarked: boolean;
  pinned: boolean;
  /** True while `createdAt` is in the future: only the creator sees it, in Studio. */
  scheduled: boolean;
  sample: boolean;
};

export type Comment = {
  id: string;
  postId: string;
  author: ProfileSummary;
  text: string;
  createdAt: number;
};

export type Message = {
  id: string;
  from: Address;
  to: Address;
  text: string;
  createdAt: number;
  /** Pay-per-view price for the attachment; "0" = open. */
  price: string;
  hasMedia: boolean;
  unlocked: boolean;
  media: MediaRef | null;
};

export type Conversation = {
  peer: ProfileSummary;
  last: Message;
  unread: number;
};

export type ChainEventKind = "subscribed" | "tipped" | "unlocked" | "plan";

export type ChainEvent = {
  id: string;
  kind: ChainEventKind;
  creator: Address;
  fan: Address;
  amount: string;
  fee: string;
  extra: Record<string, string | number | boolean>;
  block: number;
  ts: number;
  txHash: string;
};

export type Notification = {
  id: string;
  kind: "subscribed" | "tipped" | "unlocked" | "like" | "comment" | "renewed";
  actor: ProfileSummary;
  amount: string | null;
  postId: string | null;
  text: string | null;
  createdAt: number;
  txHash: string | null;
};

export type Subscription = {
  creator: ProfileSummary & { category: string; cover: string | null };
  until: number;
  active: boolean;
  plan: Plan;
};

export type Session = { address: Address; expiresAt: number };

export type Report = {
  id: string;
  reporter: ProfileSummary;
  kind: "post" | "profile" | "message";
  target: string;
  reason: string;
  createdAt: number;
  status: "open" | "resolved";
  /** What the target is, for the operator's eyes: a post's first line and creator, or a profile. */
  about: { label: string; href: string | null; owner: ProfileSummary | null };
};
