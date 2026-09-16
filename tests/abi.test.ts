import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { onlyChainAbi } from "../src/lib/abi/onlychain.ts";

/** The hand-written `as const` ABI must be the compiler's ABI, item for item. */
test("onlyChainAbi matches the Hardhat export", () => {
  const exported = JSON.parse(readFileSync(resolve(import.meta.dirname, "../src/lib/abi/OnlyChain.abi.json"), "utf8")) as unknown[];
  const norm = (abi: unknown[]) =>
    (abi as { type: string; name?: string }[])
      .map((item) => JSON.stringify(item, Object.keys(item).sort()))
      .sort();
  assert.deepEqual(norm(onlyChainAbi as unknown as unknown[]), norm(exported));
});
