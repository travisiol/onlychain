import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUnits } from "viem";
import { daysLeft, fmtOnly, parseOnly, shortAddress, timeAgo } from "../src/lib/format.ts";
import { HANDLE_RE, RESERVED_HANDLES } from "../src/lib/site.ts";
import { pickPlacement } from "../src/lib/server/paths.ts";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("fmtOnly trims and groups", () => {
  assert.equal(fmtOnly(parseUnits("25", 18)), "25 ONLY");
  assert.equal(fmtOnly(parseUnits("0.5", 18)), "0.5 ONLY");
  assert.equal(fmtOnly(parseUnits("1250", 18)), "1,250 ONLY");
  assert.equal(fmtOnly(parseUnits("12.345678", 18)), "12.34 ONLY");
  assert.equal(fmtOnly("0"), "0 ONLY");
  assert.equal(fmtOnly(parseUnits("7", 18), { symbol: false }), "7");
});

test("parseOnly accepts decimals and rejects junk", () => {
  assert.equal(parseOnly("12.5"), parseUnits("12.5", 18));
  assert.equal(parseOnly("1,000"), parseUnits("1000", 18));
  assert.equal(parseOnly(""), null);
  assert.equal(parseOnly("abc"), null);
  assert.equal(parseOnly("1.2.3"), null);
  assert.equal(parseOnly("-5"), null);
});

test("timeAgo and daysLeft", () => {
  const now = 1_800_000_000_000;
  assert.equal(timeAgo(now - 10_000, now), "just now");
  assert.equal(timeAgo(now - 5 * 60_000, now), "5m");
  assert.equal(timeAgo(now - 3 * 3_600_000, now), "3h");
  assert.equal(timeAgo(now - 2 * 86_400_000, now), "2d");
  assert.equal(daysLeft(now / 1000 + 3 * 86_400, now), 3);
  assert.equal(daysLeft(now / 1000 - 10, now), 0);
});

test("handles: shape and reserved words", () => {
  assert.ok(HANDLE_RE.test("luna.vega_1"));
  assert.ok(!HANDLE_RE.test("ab"));
  assert.ok(!HANDLE_RE.test("Luna"));
  assert.ok(!HANDLE_RE.test("_luna"));
  assert.ok(RESERVED_HANDLES.has("home") && RESERVED_HANDLES.has("api") && RESERVED_HANDLES.has("p"));
  assert.equal(shortAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"), "0x7099…79C8");
});

test("storage falls back to the temp dir when ./data is not writable", () => {
  const cwd = mkdtempSync(join(tmpdir(), "oc-paths-"));
  writeFileSync(join(cwd, "data"), "a file where the folder should be");
  const placement = pickPlacement({}, cwd, mkdtempSync(join(tmpdir(), "oc-tmp-")));
  assert.equal(placement.ephemeral, true);
  assert.match(placement.dbPath, /onlychain[\\/]onlychain\.db$/);
  const ok = pickPlacement({}, mkdtempSync(join(tmpdir(), "oc-ok-")));
  assert.equal(ok.ephemeral, false);
  const explicit = pickPlacement({ ONLYCHAIN_DB_PATH: join(cwd, "x.db"), ONLYCHAIN_UPLOAD_DIR: join(cwd, "up") }, cwd);
  assert.equal(explicit.dbPath, join(cwd, "x.db"));
  assert.equal(explicit.ephemeral, false);
});
