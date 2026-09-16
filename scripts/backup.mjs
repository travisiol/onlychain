/**
 * Snapshot the database and the uploads into backups/<timestamp>/:
 *
 *   node scripts/backup.mjs              # reads ONLYCHAIN_DB_PATH / ONLYCHAIN_UPLOAD_DIR, else ./data
 *   BACKUP_DIR=/mnt/backups node scripts/backup.mjs
 *
 * The database copy is a consistent `VACUUM INTO` (safe while the site runs,
 * WAL included); the uploads are copied file by file. Keep the folder
 * somewhere else than the server, and run it from cron.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.ONLYCHAIN_DB_PATH || resolve("data/onlychain.db");
const uploads = process.env.ONLYCHAIN_UPLOAD_DIR || resolve("data/uploads");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = resolve(process.env.BACKUP_DIR || "backups", stamp);
mkdirSync(out, { recursive: true });

if (!existsSync(dbPath)) {
  console.error(`no database at ${dbPath}`);
  process.exit(1);
}
const db = new DatabaseSync(dbPath, { readOnly: true });
db.exec(`VACUUM INTO '${join(out, "onlychain.db").replace(/'/g, "''")}'`);
db.close();
console.log(`database → ${join(out, "onlychain.db")}`);
if (existsSync(uploads)) {
  cpSync(uploads, join(out, "uploads"), { recursive: true });
  console.log(`uploads  → ${join(out, "uploads")}`);
}
console.log("done");
