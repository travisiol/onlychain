import type { Plan } from "@/lib/model";

/** The bundle discount (bps) the contract applies for `months` — 12+ → 12-month tier, 6+ → 6, 3+ → 3. */
export function discountFor(plan: NonNullable<Plan>, months: number): number {
  return months >= 12 ? plan.discount12Bps : months >= 6 ? plan.discount6Bps : months >= 3 ? plan.discount3Bps : 0;
}

/** What `subscribe(creator, months)` will charge — the same arithmetic as `quoteSubscription` on the chain. */
export function quoteMonths(plan: NonNullable<Plan>, months: number): bigint {
  const gross = BigInt(plan.monthlyPrice) * BigInt(months);
  return gross - (gross * BigInt(discountFor(plan, months))) / 10_000n;
}
