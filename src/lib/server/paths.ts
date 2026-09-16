import { accessSync, constants, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Where the SQLite file and the uploads live. Three answers, in order:
 *
 *   1. `ONLYCHAIN_DB_PATH` / `ONLYCHAIN_UPLOAD_DIR` — you said so.
 *   2. `./data/…` — a machine you own: created on first run, persists.
 *   3. `<tmpdir>/onlychain/…` — a read-only deployment (Vercel: `/var/task`
 *      cannot be written to, only `/tmp` can). The site runs, but this
 *      storage is *ephemeral*: every cold start is a fresh, re-seeded
 *      database, uploads vanish, and instances do not share it. Fine to
 *      show the site; not a place to keep real creators' content.
 */
export type Placement = {
  dbPath: string;
  uploadDir: string;
  /** True when the files will not survive a cold start. */
  ephemeral: boolean;
  reason: string | null;
};

function writable(dir: string): boolean {
  try {
    mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });
    accessSync(/* turbopackIgnore: true */ dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function pickPlacement(env: Record<string, string | undefined> = process.env, cwd: string = process.cwd(), tmp: string = tmpdir()): Placement {
  const explicitDb = env.ONLYCHAIN_DB_PATH?.trim();
  const explicitUploads = env.ONLYCHAIN_UPLOAD_DIR?.trim();
  const dataDir = join(cwd, "data");
  const local = writable(dataDir);

  let dbPath: string;
  let uploadDir: string;
  let ephemeral = false;
  let reason: string | null = null;

  if (explicitDb) dbPath = resolve(/* turbopackIgnore: true */ explicitDb);
  else if (local) dbPath = join(dataDir, "onlychain.db");
  else {
    const fallback = join(tmp, "onlychain");
    mkdirSync(/* turbopackIgnore: true */ fallback, { recursive: true });
    dbPath = join(fallback, "onlychain.db");
    ephemeral = true;
    reason = `${dataDir} is not writable (read-only deployment)`;
  }

  if (explicitUploads) uploadDir = resolve(/* turbopackIgnore: true */ explicitUploads);
  else if (local) uploadDir = join(dataDir, "uploads");
  else {
    uploadDir = join(tmp, "onlychain", "uploads");
    ephemeral = true;
    reason ??= `${dataDir} is not writable (read-only deployment)`;
  }
  mkdirSync(/* turbopackIgnore: true */ uploadDir, { recursive: true });

  return { dbPath, uploadDir, ephemeral, reason };
}
