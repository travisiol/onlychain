/**
 * Everything that names the project lives here. Renaming = this file, the
 * `NEXT_PUBLIC_ONLYCHAIN_*` env prefix, package.json and the README.
 */
export const site = {
  name: "OnlyChain",
  /** Uppercase wordmark, as OnlyFans sets its own. */
  wordmark: "OnlyChain",
  tagline: "Support your favorite creators. Pay in $ONLY.",
  description:
    "OnlyChain is the creator subscription platform paid in one coin. Subscriptions, tips and pay-per-view are settled wallet to wallet on Robinhood Chain — the site never holds a token.",
  token: {
    name: "OnlyChain",
    symbol: "ONLY",
    decimals: 18,
  },
  /** Platform share, mirrored from the contract's immutable `feeBps`. The site reads the live value and warns if it differs. */
  feeBps: 1000,
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3766",
  buyUrl: process.env.NEXT_PUBLIC_ONLYCHAIN_BUY_URL ?? "",
  /** Placeholder handles — nothing registered. */
  x: "@onlychain",
  minAge: 18,
} as const;

/** Route names a creator handle can never take. */
export const RESERVED_HANDLES = new Set([
  "home",
  "explore",
  "creators",
  "collections",
  "setup",
  "ops",
  "messages",
  "notifications",
  "subscriptions",
  "wallet",
  "studio",
  "settings",
  "token",
  "api",
  "p",
  "login",
  "logout",
  "admin",
  "onlychain",
  "help",
  "terms",
  "privacy",
  "about",
  "_next",
  "favicon.ico",
  "icon",
  "opengraph-image",
]);

export const HANDLE_RE = /^[a-z0-9][a-z0-9_.]{2,23}$/;
