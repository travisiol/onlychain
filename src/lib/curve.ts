/**
 * The Pons V2 bonding-curve quote, as the site computes it before calling
 * `buy`: a constant product over (quote reserve incl. the phantom quote,
 * token reserve), the fee taken on the way in. Verified on Robinhood Chain
 * to the wei (see chain/test/MockCurve.test.ts against the mock, which uses
 * the same formula). Pure, so both the browser and tests can use it.
 */
export type Reserves = { quote: bigint; tokens: bigint };

/** `getReserves()` returns (quote, tokens); the token side is always the far larger number, which guards against a swapped order. */
export function normalizeReserves(a: bigint, b: bigint): Reserves {
  return a > b ? { quote: b, tokens: a } : { quote: a, tokens: b };
}

export function quoteBuy(reserves: Reserves, feeBps: number, quoteIn: bigint): { tokensOut: bigint; fee: bigint } {
  if (quoteIn <= 0n) return { tokensOut: 0n, fee: 0n };
  const fee = (quoteIn * BigInt(feeBps)) / 10_000n;
  const net = quoteIn - fee;
  const tokensOut = (reserves.tokens * net) / (reserves.quote + net);
  return { tokensOut, fee };
}

/** What selling `tokensIn` pays: `gross = q × s / (t + s)`, the fee taken on the way out. */
export function quoteSell(reserves: Reserves, feeBps: number, tokensIn: bigint): { quoteOut: bigint; fee: bigint } {
  if (tokensIn <= 0n) return { quoteOut: 0n, fee: 0n };
  const gross = (reserves.quote * tokensIn) / (reserves.tokens + tokensIn);
  const fee = (gross * BigInt(feeBps)) / 10_000n;
  return { quoteOut: gross - fee, fee };
}

/** Quote needed for `tokensWanted` (inverse of quoteBuy, rounded up), for "you need N more ONLY". */
export function quoteFor(reserves: Reserves, feeBps: number, tokensWanted: bigint): bigint {
  if (tokensWanted <= 0n) return 0n;
  if (tokensWanted >= reserves.tokens) return 0n;
  // net = q * out / (t - out); in = net / (1 - fee)
  const net = (reserves.quote * tokensWanted) / (reserves.tokens - tokensWanted) + 1n;
  return (net * 10_000n) / BigInt(10_000 - feeBps) + 1n;
}

export const withSlippage = (amount: bigint, bps = 100) => (amount * BigInt(10_000 - bps)) / 10_000n;
