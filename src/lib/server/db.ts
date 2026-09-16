import "server-only";
import { DatabaseSync } from "node:sqlite";
import { pickPlacement, type Placement } from "@/lib/server/paths";

/**
 * One SQLite file, opened once per process. `node:sqlite` ships with Node
 * 22.13+ / 24: nothing to build, nothing to configure. The schema is created
 * on first open; the sample creators are seeded right after if the file is
 * new (see seed.ts). Amounts are wei as TEXT — SQLite integers stop at 2^63.
 */

declare global {
  // Survives Next's dev-time module reloads, which would otherwise open a fresh handle per reload.
  var __onlychainDb: DatabaseSync | undefined;
  var __onlychainPlacement: Placement | undefined;
  var __onlychainSeeded: boolean | undefined;
}

export function placement(): Placement {
  if (!globalThis.__onlychainPlacement) {
    const p = pickPlacement();
    if (p.ephemeral) {
      console.warn(
        `[onlychain] ${p.reason} — using ${p.dbPath}. This storage is ephemeral: the database and uploads reset on every cold start ` +
          `and are not shared between instances. Set ONLYCHAIN_DB_PATH / ONLYCHAIN_UPLOAD_DIR to a persistent disk before taking real content.`,
      );
    }
    globalThis.__onlychainPlacement = p;
  }
  return globalThis.__onlychainPlacement;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS profiles (
    address       TEXT PRIMARY KEY,
    handle        TEXT UNIQUE,
    display_name  TEXT NOT NULL DEFAULT '',
    bio           TEXT NOT NULL DEFAULT '',
    category      TEXT NOT NULL DEFAULT '',
    avatar_media  TEXT,
    cover_media   TEXT,
    is_creator    INTEGER NOT NULL DEFAULT 0,
    verified      INTEGER NOT NULL DEFAULT 0,
    hue           INTEGER NOT NULL DEFAULT 268,
    created_at    INTEGER NOT NULL,
    sample        INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS profiles_creator ON profiles(is_creator, created_at);

  CREATE TABLE IF NOT EXISTS media (
    id          TEXT PRIMARY KEY,
    owner       TEXT NOT NULL,
    mime        TEXT NOT NULL,
    path        TEXT NOT NULL,
    width       INTEGER,
    height      INTEGER,
    bytes       INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id          TEXT PRIMARY KEY,
    creator     TEXT NOT NULL,
    text        TEXT NOT NULL DEFAULT '',
    media_id    TEXT,
    access      TEXT NOT NULL,
    price       TEXT NOT NULL DEFAULT '0',
    created_at  INTEGER NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0,
    sample      INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS posts_creator ON posts(creator, deleted, created_at);
  CREATE INDEX IF NOT EXISTS posts_time ON posts(deleted, created_at);

  CREATE TABLE IF NOT EXISTS likes (
    post_id     TEXT NOT NULL,
    address     TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (post_id, address)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id          TEXT PRIMARY KEY,
    post_id     TEXT NOT NULL,
    address     TEXT NOT NULL,
    text        TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id, created_at);

  CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    sender      TEXT NOT NULL,
    recipient   TEXT NOT NULL,
    text        TEXT NOT NULL DEFAULT '',
    media_id    TEXT,
    price       TEXT NOT NULL DEFAULT '0',
    created_at  INTEGER NOT NULL,
    read_at     INTEGER
  );
  CREATE INDEX IF NOT EXISTS messages_recipient ON messages(recipient, created_at);
  CREATE INDEX IF NOT EXISTS messages_sender ON messages(sender, created_at);

  CREATE TABLE IF NOT EXISTS chain_events (
    id        TEXT PRIMARY KEY,
    kind      TEXT NOT NULL,
    creator   TEXT NOT NULL,
    fan       TEXT NOT NULL,
    amount    TEXT NOT NULL DEFAULT '0',
    fee       TEXT NOT NULL DEFAULT '0',
    extra     TEXT NOT NULL DEFAULT '{}',
    block     INTEGER NOT NULL,
    ts        INTEGER NOT NULL,
    tx_hash   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS chain_events_creator ON chain_events(creator, ts);
  CREATE INDEX IF NOT EXISTS chain_events_fan ON chain_events(fan, ts);

  CREATE TABLE IF NOT EXISTS meta (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS nonces (
    nonce       TEXT PRIMARY KEY,
    expires_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS seen (
    address            TEXT PRIMARY KEY,
    notifications_at   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS post_media (
    post_id     TEXT NOT NULL,
    media_id    TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (post_id, media_id)
  );
  CREATE INDEX IF NOT EXISTS post_media_media ON post_media(media_id);

  CREATE TABLE IF NOT EXISTS bookmarks (
    post_id     TEXT NOT NULL,
    address     TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (post_id, address)
  );
  CREATE INDEX IF NOT EXISTS bookmarks_address ON bookmarks(address, created_at);

  CREATE TABLE IF NOT EXISTS blocks (
    blocker     TEXT NOT NULL,
    blocked     TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (blocker, blocked)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id          TEXT PRIMARY KEY,
    reporter    TEXT NOT NULL,
    kind        TEXT NOT NULL,
    target      TEXT NOT NULL,
    reason      TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );
`;

/** Columns added after the first release: `ALTER TABLE` is not idempotent, so check first. */
const MIGRATIONS: [table: string, column: string, ddl: string][] = [
  ["posts", "pinned", "ALTER TABLE posts ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"],
  ["profiles", "welcome_message", "ALTER TABLE profiles ADD COLUMN welcome_message TEXT NOT NULL DEFAULT ''"],
  ["profiles", "suspended", "ALTER TABLE profiles ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0"],
  ["reports", "status", "ALTER TABLE reports ADD COLUMN status TEXT NOT NULL DEFAULT 'open'"],
];

export function db(): DatabaseSync {
  if (!globalThis.__onlychainDb) {
    const handle = new DatabaseSync(placement().dbPath);
    handle.exec("PRAGMA journal_mode = WAL");
    handle.exec("PRAGMA busy_timeout = 5000");
    handle.exec(SCHEMA);
    for (const [table, column, ddl] of MIGRATIONS) {
      const cols = handle.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!cols.some((c) => c.name === column)) handle.exec(ddl);
    }
    // posts that predate post_media: their single media becomes position 0
    handle.exec("INSERT OR IGNORE INTO post_media(post_id, media_id, position) SELECT id, media_id, 0 FROM posts WHERE media_id IS NOT NULL");
    globalThis.__onlychainDb = handle;
  }
  return globalThis.__onlychainDb;
}

export function getMeta(key: string): string | null {
  const row = db().prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string): void {
  db().prepare("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

// ─────────────────────────────── nonces ───────────────────────────────

export function putNonce(nonce: string, ttlMs: number): void {
  const d = db();
  d.prepare("DELETE FROM nonces WHERE expires_at < ?").run(Date.now());
  d.prepare("INSERT INTO nonces(nonce, expires_at) VALUES (?, ?)").run(nonce, Date.now() + ttlMs);
}

/** Consume a nonce: true once, then never again. */
export function takeNonce(nonce: string): boolean {
  const d = db();
  const row = d.prepare("SELECT expires_at FROM nonces WHERE nonce = ?").get(nonce) as { expires_at: number } | undefined;
  if (!row) return false;
  d.prepare("DELETE FROM nonces WHERE nonce = ?").run(nonce);
  return row.expires_at >= Date.now();
}
